package trade.tbot.jobscout

import android.app.Application
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import kotlin.math.cos
import kotlin.math.sin


// The Kenya market (2026-09-15): the same sweep re-gated for a hire based in Kenya,
// with its own rubric. One app, one package; the market is a switch.
val MARKETS = listOf("ca" to "Canada", "ke" to "Kenya")

enum class Phase { IDLE, GATES, SCORING, DONE }

/** How many gate verdicts stream before the rest go behind a tap. Matches the web. */
const val GATE_STREAM = 6

/** How many saved jobs list before the rest go behind a tap. Matches the web. */
const val SAVED_SHOWN = 4

/** Run with no resume. Same words as the web page. */
const val NO_RESUME = "Add your resume above — upload a file, or paste the text."


/** One of the three drafts: not asked for, running, arrived, or refused. */
data class Step<T>(val busy: Boolean = false, val data: T? = null, val error: String? = null)

/**
 * One application, being prepared. Mirrors site/apply.html: a cover letter, the
 * candidate's own resume rebuilt for this job, and the employer's screening
 * questions answered from the profile — each asked for separately, because each
 * costs a call and not everyone wants all three.
 */
data class Apply(
    val posting: Posting,
    val fit: Int,
    val letter: Step<String> = Step(),
    val resume: Step<ResumeResponse> = Step(),
    val answers: Step<AnswersResponse> = Step(),
)

data class Ui(
    val feed: Feed? = null,
    val market: String = "ca",
    val update: LatestRelease? = null,   // a newer GitHub release, sideloaded copies only
    val resume: String = "",          // pasted/extracted resume text — in-memory only, never persisted
    val uploading: Boolean = false,
    val uploadStatus: String? = null,
    val phase: Phase = Phase.IDLE,
    val selection: Selection? = null,   // which postings met Claude, and why (sector + counts)
    val home: String = "",              // province the visitor lives in; "" = anywhere
    val remoteOnly: Boolean = false,
    val gatesShown: Int = 0,
    val scores: List<Score> = emptyList(),
    val meta: Meta? = null,
    val fromCache: Boolean = false,
    val banner: String? = null,
    val apply: Apply? = null,           // the open application page, or none
    /* Drafts survive closing the page. Each one costs a Claude call, so throwing
       three away because someone looked at the posting is expensive in the one
       currency the user actually pays. Keyed by posting; `draftsFor` is the resume
       they were written from, because a letter drafted for one profile shown
       against another is worse than no letter. */
    val drafts: Map<String, Apply> = emptyMap(),
    val draftsFor: String = "",
    val error: String? = null,
    val tracker: Map<String, Tracked> = emptyMap(),   // per-device pipeline — the only thing persisted
    val watched: List<Watch> = emptyList(),           // searches kept on the device; nothing is sent
    /* The candidate has said they want to apply below the floor. Per run and
       never persisted: a new resume deserves the honest answer first. */
    val stretch: Boolean = false,
    /** Set when the restored run was scored against an earlier day's sweep. */
    val runStale: String? = null,
)

class DemoVm(app: Application) : AndroidViewModel(app) {
    private val _ui = MutableStateFlow(
        RunStore.load(app).let { r ->
            Ui(
                tracker = TrackerStore.load(app), watched = WatchStore.load(app),
                // The market is checked against the run when the feed lands, not here:
                // the saved market IS the market to open in, which setMarket does below.
                market = r?.market ?: "ca",
                scores = r?.scores ?: emptyList(),
                resume = r?.profile.orEmpty(),
            )
        }
    )
    val ui = _ui.asStateFlow()

    init { loadFeed(); checkForUpdate(); Api.ev("open", market = _ui.value.market) }

    /**
     * Sideloaded copies have no store to update them, so the app asks GitHub for
     * the latest release once per launch and offers the download when it is newer.
     * A copy installed from Google Play is updated by Play and never sees this.
     * Any failure here is silent — an update check must never cost the user anything.
     */
    private fun checkForUpdate() {
        val app = getApplication<Application>()
        val installer = runCatching {
            if (android.os.Build.VERSION.SDK_INT >= 30) app.packageManager.getInstallSourceInfo(app.packageName).installingPackageName
            else @Suppress("DEPRECATION") app.packageManager.getInstallerPackageName(app.packageName)
        }.getOrNull()
        if (installer == "com.android.vending") return
        viewModelScope.launch {
            runCatching { Api.latestRelease() }.onSuccess { r ->
                if (isNewer(r.tag_name, BuildConfig.VERSION_NAME)) _ui.update { it.copy(update = r) }
            }
        }
    }

    /** Retry path for a failed first load - without this the only fix is a force-quit. */
    fun loadFeed() {
        _ui.update { it.copy(error = null) }
        viewModelScope.launch {
            runCatching { Api.feed(_ui.value.market) }
                // vetRestoredRun needs the feed's day, so the restored run is
                // judged here rather than in the constructor.
                .onSuccess { f -> _ui.update { vetRestoredRun(it.copy(feed = f, error = null)) } }
                .onFailure { e -> _ui.update { it.copy(error = friendlyError(e)) } }
        }
    }

    /**
     * A phone with no route to the network throws UnknownHostException, and its
     * message is the raw hostname - which told the reader nothing except that
     * something internal broke. Name the actual condition instead; anything we
     * cannot classify keeps its detail, because that one IS worth reporting.
     */
    private fun friendlyError(e: Throwable): String = when (e) {
        is UnknownHostException, is ConnectException ->
            "No internet connection — JobScout can't reach the feed."
        is SocketTimeoutException ->
            "The connection timed out. Try again in a moment."
        is SSLException ->
            "Couldn't establish a secure connection."
        else -> "Feed unavailable: ${e.message ?: e::class.java.simpleName}"
    }

    /** Switching market swaps the feed, the candidates and the rubric; a run in progress is left alone. */
    fun setMarket(m: String) {
        if (m == _ui.value.market) return
        // home is cleared with the market: "Manitoba" means nothing in the Kenya feed.
        _ui.update { it.copy(market = m, home = "", remoteOnly = false,
                             feed = null, phase = Phase.IDLE, scores = emptyList(), banner = null,
                             runStale = null).also { RunStore.save(getApplication(), null) } }
        loadFeed()
    }
    fun setHome(code: String) {
        Api.ev("where", code.ifEmpty { "any" }, _ui.value.market)
        _ui.update { it.copy(home = code) }
    }
    fun toggleRemoteOnly() {
        Api.ev("remote", if (_ui.value.remoteOnly) "off" else "on", _ui.value.market)
        _ui.update { it.copy(remoteOnly = !it.remoteOnly) }
    }

    // counted once a process: pasting is one step, not one per keystroke
    private var pasteCounted = false
    fun setResume(s: String) {
        if (!pasteCounted && s.trim().length > 40) { pasteCounted = true; Api.ev("paste", market = _ui.value.market) }
        _ui.update { it.copy(resume = s.take(6000)) }
    }

    /* Same rule as the web page: the pasted resume, once it is long enough to be one,
       or nothing. Three fictional candidates used to sit under the button as a
       fallback; they were removed on 2026-09-19 because they asked the visitor to do
       the product's work before it had done any. */
    private fun profileText(): String? = _ui.value.resume.trim().takeIf { it.length > 40 }

    /** Storage Access Framework pick → worker /api/extract → resume text. Bytes live in memory only. */
    fun importResume(uri: Uri) {
        val cr = getApplication<Application>().contentResolver
        viewModelScope.launch {
            _ui.update { it.copy(uploading = true, uploadStatus = null) }
            val status = runCatching {
                val (bytes, meta) = withContext(Dispatchers.IO) {
                    // Name feeds the worker's extension sniff; size rejects a huge file before it is
                    // read into memory and uploaded (the worker would 413 it anyway).
                    var n: String? = null
                    var size = 0L
                    cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                        ?.use { c ->
                            if (c.moveToFirst()) {
                                val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                                val si = c.getColumnIndex(OpenableColumns.SIZE)
                                if (ni >= 0) n = c.getString(ni)
                                if (si >= 0) size = c.getLong(si)
                            }
                        }
                    if (size > 2_000_000L) error("Max 2 MB.")
                    val b = cr.openInputStream(uri)?.use { it.readBytes() } ?: error("couldn't open the file")
                    // getType() is a binder IPC into a possibly remote provider — keep it off the main thread.
                    b to ((n ?: uri.lastPathSegment ?: "resume") to (cr.getType(uri) ?: "application/octet-stream"))
                }
                val (name, mime) = meta
                val r = Api.extract(bytes, mime, name)
                if (r.error != null) r.detail ?: r.error
                else {
                    setResume(r.text)
                    "✓ ${"%,d".format(r.chars)} characters extracted from $name — review, then run" +
                        (if (r.chars > 6000) " (trimmed to 6,000)" else "")
                }
            }.getOrElse { "Upload failed: ${it.message}" }
            _ui.update { it.copy(uploading = false, uploadStatus = status) }
        }
    }

    fun allowStretch() = _ui.update { it.copy(stretch = true) }

    /** Write the run to disk and return the state unchanged, so it can sit inside an update {}. */
    private fun keepRun(u: Ui): Ui {
        RunStore.save(getApplication(), if (u.scores.isEmpty()) null else SavedRun(
            day = u.feed?.day.orEmpty(), market = u.market,
            fp = fingerprint(u.resume), profile = u.resume, scores = u.scores,
        ))
        return u
    }

    /**
     * Once the feed is in, the restored run can finally be checked against it.
     * A run from another day is kept and labelled; one from another resume is
     * dropped, because there is no honest way to show it.
     */
    private fun vetRestoredRun(u: Ui): Ui {
        val saved = RunStore.load(getApplication()) ?: return u
        if (u.scores.isEmpty()) return u
        if (saved.fp != fingerprint(u.resume)) {
            RunStore.save(getApplication(), null)
            return u.copy(scores = emptyList(), runStale = null)
        }
        val day = u.feed?.day.orEmpty()
        return u.copy(runStale = if (saved.day.isNotEmpty() && day.isNotEmpty() && saved.day != day)
            "These matches were scored against ${saved.day}'s sweep, not today's. Run it again for today's."
        else null)
    }

    fun run() {
        val feed = _ui.value.feed ?: return
        if (_ui.value.phase == Phase.GATES || _ui.value.phase == Phase.SCORING) return
        // A new run is a new answer; the opt-in belonged to the resume that earned it.
        _ui.update { it.copy(stretch = false) }
        val profile = profileText() ?: run {
            _ui.update { it.copy(banner = NO_RESUME) }; return
        }
        val sel = select(profile, feed, _ui.value.home, _ui.value.remoteOnly)
        Api.ev("run", sel.sector, _ui.value.market)
        viewModelScope.launch {
            _ui.update { it.copy(phase = Phase.GATES, gatesShown = 0, scores = emptyList(),
                                 meta = null, banner = null, fromCache = false, selection = sel) }
            repeat(minOf(feed.rejects.size, GATE_STREAM) + 1) {
                delay(160)
                _ui.update { s -> s.copy(gatesShown = s.gatesShown + 1) }
            }
            _ui.update { it.copy(phase = Phase.SCORING) }
            runCatching { Api.score(profile, sel.postings, _ui.value.market) }
                .onSuccess { r ->
                    when {
                        r.breaker -> {
                            val cached = r.cached?.scores ?: emptyList()
                            _ui.update { it.copy(phase = Phase.DONE, banner = r.detail,
                                scores = cached, meta = r.cached?.meta, fromCache = true) }
                        }
                        r.error != null -> _ui.update { it.copy(phase = Phase.DONE, banner = r.detail ?: r.error) }
                        else -> {
                            _ui.update { u ->
                                keepRun(u.copy(phase = Phase.DONE, scores = r.scores, meta = r.meta,
                                               runStale = null))
                            }
                        }
                    }
                }
                .onFailure { e -> _ui.update { it.copy(phase = Phase.DONE, banner = "Scoring failed: ${e.message}") } }
        }
    }

    // ── The application page ────────────────────────────────────────────────

    /**
     * Update one application by POSTING, not by "whatever is on screen". A draft
     * takes seconds to come back and the page can be closed before it does; keying
     * the write to the posting means the result still lands, and is there when the
     * card is opened again.
     */
    private fun patch(id: String, f: (Apply) -> Apply) = _ui.update { u ->
        val target = u.drafts[id] ?: u.apply?.takeIf { it.posting.id == id } ?: return@update u
        val next = f(target)
        u.copy(
            apply = if (u.apply?.posting?.id == id) next else u.apply,
            drafts = u.drafts + (id to next),
        )
    }

    /** Watch this slice of the day, or stop. Mirrors the web's bell exactly:
     *  kept on the device, listed on the Saved screen, nothing emailed. */
    fun toggleWatch(key: String, human: String, sector: String) {
        val now = _ui.value.watched
        val next = if (now.any { it.key == key }) now.filter { it.key != key }
                   else now + Watch(key, human, _ui.value.market, sector,
                                    java.time.LocalDate.now().toString())
        WatchStore.save(getApplication(), next)
        _ui.update { it.copy(watched = next) }
    }

    fun openApply(posting: Posting) {
        val profile = profileText().orEmpty()
        val fit = _ui.value.scores.firstOrNull { it.id == posting.id }?.fit ?: 0
        Api.ev("apply_open", bandFor(fit).first, _ui.value.market)
        _ui.update { u ->
            // A different resume invalidates every draft at once — they were all
            // written from the old one.
            val kept = if (u.draftsFor == profile) u.drafts else emptyMap()
            // Reuse the drafts, but take the fit from the run that is current.
            val open = kept[posting.id]?.copy(posting = posting, fit = fit) ?: Apply(posting, fit)
            u.copy(apply = open, drafts = kept + (posting.id to open), draftsFor = profile)
        }
    }

    fun closeApply() = _ui.update { u ->
        u.copy(apply = null, drafts = u.apply?.let { u.drafts + (it.posting.id to it) } ?: u.drafts)
    }

    /**
     * The three drafts share a shape: mark busy, call, and store either the result
     * or one sentence saying why not. A breaker (the day's budget spent) and a
     * refusal (the model tried to invent something) both arrive as `detail`, and
     * both are worth reading — so neither is swallowed into "unavailable".
     */
    private fun <T> draft(
        name: String,
        get: (Apply) -> Step<T>,
        put: (Apply, Step<T>) -> Apply,
        call: suspend (String, Posting, Int) -> Pair<T?, String?>,
    ) {
        val a = _ui.value.apply ?: return
        /* Every step is written FROM the resume, and the resume is whatever is in
           the box on the landing screen. Clear that box and this used to `return`
           in silence: three buttons still sitting there, each doing nothing when
           pressed, with no way to find out why. Say it instead. The web has
           always shown "Paste your resume" in this case. */
        val profile = profileText() ?: run {
            patch(_ui.value.apply?.posting?.id ?: return) {
                put(it, Step(error = "Your resume is not in the box any more — paste it back on the " +
                    "first screen and this can be written from it."))
            }
            return
        }
        if (get(a).busy) return
        val id = a.posting.id
        Api.ev(name, market = _ui.value.market)
        patch(id) { put(it, Step(busy = true)) }
        viewModelScope.launch {
            runCatching { call(profile, a.posting, a.fit) }
                .onSuccess { (data, why) -> patch(id) { put(it, Step(data = data, error = why)) } }
                .onFailure { e -> patch(id) { put(it, Step(error = "That call didn't get through: ${e.message}")) } }
        }
    }

    fun draftLetter() = draft("letter", { it.letter }, { a, s -> a.copy(letter = s) }) { p, post, fit ->
        val r = Api.letter(p, post, fit)
        if (r.breaker || r.error != null) null to (r.detail ?: r.error ?: "Unavailable.") else r.letter to null
    }

    fun buildResume() = draft("tailor", { it.resume }, { a, s -> a.copy(resume = s) }) { p, post, fit ->
        val r = Api.resume(p, post, fit)
        if (r.breaker || r.error != null) null to (r.detail ?: r.error ?: "Unavailable.") else r to null
    }

    /**
     * `unsupported` is not a failure: it means this employer's board does not publish
     * its form, which is worth saying plainly rather than showing as an error.
     */
    fun readAnswers() = draft("apply_open", { it.answers }, { a, s -> a.copy(answers = s) }) { p, post, fit ->
        val r = Api.answers(p, post, fit)
        when {
            r.unsupported -> r to null
            r.breaker || r.error != null -> null to (r.detail ?: r.error ?: "Unavailable.")
            else -> r to null
        }
    }


    // ── Tracker (per device, persisted on every change) ──────────────────────
    private fun setTracker(items: Map<String, Tracked>) {
        _ui.update { it.copy(tracker = items) }
        TrackerStore.save(getApplication<Application>(), items)
    }

    /** Upserts; a posting not yet tracked (e.g. removed, then re-staged from its card) enters at that stage. */
    fun setStage(item: Tracked, stage: String) {
        // The word alone leaves the device — no title, no company, no id (see site/privacy.html).
        if (stage != "survivor" && _ui.value.tracker[item.id]?.stage != stage) Api.ev("outcome", stage, _ui.value.market)
        if (!_ui.value.tracker.containsKey(item.id)) Api.ev("save", market = _ui.value.market)
        setTracker(_ui.value.tracker + (item.id to item.copy(stage = stage, updated = Instant.now().toString())))
    }

    fun untrack(id: String) = setTracker(_ui.value.tracker - id)
    fun clearTracker() = setTracker(emptyMap())

}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // targetSdk 35 is edge-to-edge whether we ask or not; asking makes the
        // bars transparent over the cream. The style is pinned to LIGHT (dark
        // icons) because the app is always cream — the default guesses from the
        // phone's dark-mode setting and painted the clock white on cream.
        val bars = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
        super.onCreate(savedInstanceState)
        setContent { JobScoutTheme { DemoScreen() } }
    }
}

private val RESUME_MIMES = arrayOf(
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
)

/** Which of the mockup's three mobile screens is showing. */
enum class Screen { LANDING, BROWSE, MATCHES }

@Composable
fun DemoScreen(vm: DemoVm = viewModel()) {
    val ui by vm.ui.collectAsState()
    val feed = ui.feed
    var trackerOpen by remember { mutableStateOf(false) }
    /** "how" or "privacy" when one of the footer's pages is open. */
    var infoPage by remember { mutableStateOf<String?>(null) }
    var screen by remember { mutableStateOf(Screen.LANDING) }
    var policy by remember { mutableStateOf<String?>(null) }
    // Storage Access Framework: no storage permission, the user picks one document.
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(vm::importResume)
    }
    var query by remember { mutableStateOf<String?>(null) }
    // Which slice of the feed the sweep is showing, if any. Set by a tile on the
    // landing or a chip in Browse; cleared by the same chip or by Clear.
    var sector by remember { mutableStateOf<String?>(null) }
    // Jobs or Companies, the web's segmented control on the sweep.
    var scope by remember { mutableStateOf("jobs") }
    /* Postings put away, and the last one, so it can come back. The web has had
       dismiss-with-undo since the redesign and the phone had nothing. */
    val dismissed = remember { mutableStateListOf<String>() }
    var lastDismissed by remember { mutableStateOf<Pair<String, String>?>(null) }
    val ins = WindowInsets.safeDrawing.asPaddingValues()
    // Theme follows the device on either market, unless the reader has stored
    // an override — the same three states the web resolves with light-dark().
    val ctx = LocalContext.current
    /* HELD IN STATE, NOT RE-READ FROM PREFERENCES EVERY FRAME. Compose
       redraws what it observes and SharedPreferences is not observable, so a
       tap that only wrote the preference would change the stored value and
       leave the screen exactly as it was until the next cold start. The
       preference remains the durable copy; this is the one the UI watches. */
    /* `remember`, not `rememberSaveable`: on an activity recreation this
       composable re-runs and reads the preference again, which is the
       durable copy and the right answer. Saving it twice would only add a
       second thing to keep in step. */
    var themeChoice by remember { mutableStateOf(ThemeChoice.stored(ctx)) }
    val tokens = tokensFor(ui.market, ThemeChoice.isDark(themeChoice, isSystemInDarkTheme()))
    val uriHandler = LocalUriHandler.current

    // A run moves you to the matches, which is the mockup's third frame; nothing else
    // navigates on its own.
    LaunchedEffect(ui.scores.isNotEmpty()) { if (ui.scores.isNotEmpty()) screen = Screen.MATCHES }

    /* Switching market throws the scores away — they were about the other
       country's feed. Staying on the matches frame then strands you on "0
       survived the gate of 323" with nothing under it, which is what the first
       Kenya run actually did.

       Not on the FIRST composition though: a run restored from disk arrives
       before this runs, and sending it to the landing frame undid the whole
       point of keeping it. */
    var marketSeen by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(ui.market) {
        if (marketSeen != null && marketSeen != ui.market) {
            screen = Screen.LANDING
            policy = null
        }
        marketSeen = ui.market
    }

    CompositionLocalProvider(LocalTokens provides tokens) {
        // The main frame had a flat fill and no texture at all.
        Box(Modifier.fillMaxSize().background(T.canvas).backdrop(T.ink)) {
          Column(Modifier.fillMaxSize()) {
            /* Outside the list, so it stays. It used to be the first item in it,
               which put the market switch, Saved and the wordmark off screen as
               soon as you read past the first card — and a matches list is now
               eight cards deep with a verdict and two evidence panels on each.
               The web's header has been sticky since the redesign. */
            Box(Modifier.background(T.canvas)
                .padding(start = 14.dp, end = 14.dp, top = ins.calculateTopPadding() + 6.dp)) {
                MHead(
                    ui.market,
                    saved = ui.tracker.size,
                    onSaved = { trackerOpen = true },
                    // Home means the top of the landing frame, with the filters
                    // it was left in cleared — the same as the web's logo.
                    onHome = {
                        screen = Screen.LANDING
                        sector = null; policy = null; query = ""
                    },
                    themeChoice = themeChoice,
                    /* Both copies move together: the state the screen watches
                       and the preference that survives the process. */
                    onTheme = {
                        themeChoice = ThemeChoice.next(themeChoice)
                        ThemeChoice.set(ctx, themeChoice)
                    },
                ) { vm.setMarket(it) }
            }
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(14.dp, 0.dp, 14.dp,
                                               ins.calculateBottomPadding() + 32.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {

                ui.error?.let { item { Banner(it, onRetry = { vm.loadFeed() }) } }
                ui.update?.let { r -> item { UpdateBar(r) } }
                ui.banner?.let { item { Banner(it) } }

                when (screen) {
                    Screen.LANDING -> landing(
                        ui, feed, vm, policy,
                        onUpload = { picker.launch(RESUME_MIMES) },
                        onSearch = { q -> query = q; screen = Screen.BROWSE },
                        onPolicy = { p ->
                            policy = p
                            // Choosing a policy is how you get from the hero into the
                            // sweep, which is what the mockup's second frame is.
                            if (p != null) screen = Screen.BROWSE
                        },
                        onMatches = { screen = Screen.MATCHES },
                        onOpen = { page -> infoPage = page },
                        // A tile is a way INTO the sweep, narrowed to it —
                        // exactly what clicking one does on the web.
                        onSector = { sec -> sector = sec; screen = Screen.BROWSE },
                    )
                    Screen.BROWSE -> browse(
                        ui, feed, policy, query, sector, scope, dismissed,
                        onClear = { query = null; sector = null },
                        onOpen = { page -> infoPage = page },
                        onSector = { sec -> sector = if (sector == sec) null else sec },
                        onScope = { scope = it },
                        onWatch = { k, h, sec -> vm.toggleWatch(k, h, sec) },
                        onDismiss = { id, title -> dismissed.add(id); lastDismissed = id to title },
                        undo = lastDismissed,
                        onUndo = {
                            lastDismissed?.let { dismissed.remove(it.first) }
                            lastDismissed = null
                        },
                    ) { policy = it }
                    Screen.MATCHES -> matches(
                        ui, feed, vm,
                        onRework = { screen = Screen.LANDING },
                        // The frame people spend the most time on had no footer
                        // at all, so how-it-works and privacy were unreachable
                        // from it.
                        onOpen = { page -> infoPage = page },
                    )
                }
            }

          }
            if (trackerOpen) TrackerScreen(vm, ui.tracker, ui.watched) { trackerOpen = false }
            infoPage?.let { page -> InfoSheet(page) { infoPage = null } }
            ui.apply?.let { a -> ApplyScreen(vm, a, vm::closeApply) }
        }
    }

    // Back walks the three frames in the order they were entered, then leaves.
    BackHandler(enabled = infoPage != null) { infoPage = null }
    BackHandler(enabled = screen != Screen.LANDING && ui.apply == null && !trackerOpen && infoPage == null) {
        screen = if (screen == Screen.MATCHES) Screen.BROWSE else Screen.LANDING
    }
}

/* ── frame 1: Landing ─────────────────────────────────────────────────────
   Hero, the morning's number, and the first two postings — enough to show the
   sweep is real without becoming the list. */
private fun LazyListScope.landing(
    ui: Ui, feed: Feed?, vm: DemoVm, policy: String?, onPolicy: (String?) -> Unit,
    onUpload: () -> Unit, onSearch: (String) -> Unit, onMatches: () -> Unit,
    onOpen: (String) -> Unit, onSector: (String) -> Unit,
) {
    item {
        MHero(
            resume = ui.resume, onResume = vm::setResume,
            /* The box promised "or a job title" and then refused anything under
               forty characters with a banner telling you to paste a resume. Both
               surfaces did it. A short entry is a SEARCH now: it filters today's
               sweep by those words, costs nothing, and returns something. Only a
               real resume is worth sending to Claude. */
            onRun = { if (looksLikeResume(ui.resume)) vm.run() else onSearch(ui.resume.trim()) },
            policy = policy, onPolicy = onPolicy,
            onUpload = onUpload, uploading = ui.uploading, hint = ui.uploadStatus,
        )
    }
    /* Forty seconds of silence reads as a dead button. */
    if (ui.phase == Phase.GATES || ui.phase == Phase.SCORING) item {
        MRunning(
            scoring = ui.phase == Phase.SCORING,
            swept = feed?.postings?.size ?: 0,
            going = ui.selection?.postings?.size ?: 0,
        )
    }
    /* A way back to a run you already paid for. Without this the matches were
       unreachable once you left them: the effect that opens that frame fires on a
       CHANGE in scores, and the scores had not changed — so the only route back was
       running again, at eight more calls. Found on the emulator 2026-09-19. */
    if (ui.scores.isNotEmpty()) item {
        MFilter("← your ${ui.scores.size} matches", on = false, onClick = onMatches)
    }
    /* "318 swept this morning" was a number you could not act on, over two rows
       and a button. The web answers this with the feed's own shape — what the
       day is MADE of — so the phone does too, and the same heading names it. */
    item { MTitle("Browse by what the feed actually knows") }
    if (feed == null) item { MCount("loading this morning's sweep…") }
    feed?.let { f ->
        val by = f.passers.groupingBy { it.sector }.eachCount()
            .toList().sortedByDescending { it.second }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                by.take(8).chunked(2).forEach { pair ->
                    Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp)) {
                        pair.forEach { (sec, n) ->
                            MTax(f.labels[sec] ?: sec, n, Modifier.weight(1f)) { onSector(sec) }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        item { Spacer(Modifier.height(6.dp)) }
        item { MTitle("Explore today's sweep") }
        item { MCount("${f.passers.size} of ${f.postings.size} swept this morning") }
    }
    /* Four rows, not two. Two was what the mockup's 620px frame held; a real
       phone is 2340px and the page ended in a screenful of nothing. */
    feed?.passers?.take(4)?.forEach { p ->
        item {
            MJob(p.title, p.company, policy = p.remote_policy,
                 onClick = p.url.takeIf { it.isNotEmpty() }?.let { u -> ({ onOpen(u) }) })
        }
    }
    /* Two postings is what the mockup's 620px frame holds. A real phone is 2340px,
       so the page ended in a screenful of nothing and read as if something had
       failed to load. The way into the rest of the sweep belongs here. */
    feed?.let { f ->
        item {
            MFilter("See all ${f.passers.size} →", on = false) { onSearch("") }
        }
    }
    item { MFoot(onOpen) }
}

/* ── frame 2: Browse ──────────────────────────────────────────────────────
   The whole sweep behind three policy filters, with the count saying how much of
   it you are looking at. */
/** The web renders sixteen company cards; the phone matches it so the two agree. */
private const val COMPANY_CAP = 16

private fun LazyListScope.browse(
    ui: Ui, feed: Feed?, policy: String?, query: String?, sector: String?, scope: String,
    dismissed: List<String>,
    onClear: () -> Unit, onOpen: (String) -> Unit, onSector: (String) -> Unit,
    onScope: (String) -> Unit, onDismiss: (String, String) -> Unit,
    onWatch: (String, String, String) -> Unit,
    undo: Pair<String, String>?, onUndo: () -> Unit,
    onPolicy: (String?) -> Unit,
) {
    val words = query.orEmpty().lowercase().split(" ").filter { it.length > 2 }
    val all = feed?.passers.orEmpty().let { list ->
        if (words.isEmpty()) list
        else list.filter { p ->
            // Same four fields as site/index.html hitsQuery(). Android left out
            // the location and the web left out the summary, so "Fraud Analyst"
            // answered 3 here and 1 there for the same feed.
            val hay = (p.title + " " + p.company + " " + p.location + " " + p.summary).lowercase()
            words.all { hay.contains(it) }
        }
    }
    // A tile on the landing, or a tile here, narrows the grid to one slice.
    val kept = all.filter { it.id !in dismissed }
    val bySector = if (sector == null) kept else kept.filter { it.sector == sector }
    /* The policy counts describe what the chips would DO, so they count the rows
       the chips can actually reach. Counting `all` here put "Remote 191" over a
       grid of 24 finance postings. */
    val counts = POLICIES.associate { (id, _) -> id to bySector.count { matchesPolicy(it, id) } }
    val rows = if (policy == null) bySector else bySector.filter { matchesPolicy(it, policy) }

    /* The feed first, then the sweep - the same order the web uses, so a phone
       and a laptop are describing one product. The tiles are the day's own
       shape; tapping one narrows the grid below rather than leaving the page. */
    feed?.let { f ->
        val by = f.passers.groupingBy { it.sector }.eachCount()
            .toList().sortedByDescending { it.second }
        item { MTitle("Browse by what the feed actually knows") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                by.take(10).chunked(2).forEach { pair ->
                    Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp)) {
                        pair.forEach { (sec, n) ->
                            MTax(
                                (f.labels[sec] ?: sec) + if (sector == sec) "  ×" else "",
                                n, Modifier.weight(1f),
                            ) { onSector(sec) }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        item { Spacer(Modifier.height(18.dp)) }
    }
    /* Jobs or Companies. The web has had the pair since the redesign; the phone
       only ever showed postings, so "who is hiring today" was a question it
       could not answer. */
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            MFilter("Jobs", on = scope == "jobs") { onScope("jobs") }
            MFilter("Companies", on = scope == "cos") { onScope("cos") }
            /* The web's bell. It keeps the search on the device and lists it on
               the Saved screen; it does not email, and does not say it will. */
            val wkey = "q:" + (sector ?: query ?: "all")
            val watching = ui.watched.any { it.key == wkey }
            // Nothing is sent: the search is kept on this device and listed on Saved.
            MFilter(if (watching) "Saved" else "Save this search", on = watching) {
                onWatch(wkey, sector?.let { feed?.labels?.get(it) ?: it } ?: query ?: "today's sweep", sector ?: "")
            }
        }
    }
    item {
        MTitle(
            when {
                scope == "cos" -> "Companies hiring today"
                words.isNotEmpty() -> "Matching “${query}”"
                sector != null -> feed?.labels?.get(sector) ?: "Explore today’s sweep"
                else -> "Explore today’s sweep"
            },
        )
    }
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            POLICIES.forEach { (id, label) ->
                val n = counts[id] ?: 0
                // The mockup labels a filter with its count, and drops the count when
                // there is nothing to count rather than printing a zero.
                MFilter(if (n > 0) "$label $n" else label, on = policy == id) {
                    onPolicy(if (policy == id) null else id)
                }
            }
        }
    }
    /* Companies, rolled up from the same rows the Jobs scope would show, so the
       two tabs never disagree about the day. Capped like the web's, and the
       count says the cap rather than quoting a total the grid does not render. */
    val companies = rows.groupBy { it.company }.toList().sortedByDescending { it.second.size }
    if (scope == "cos") {
        item { MCount("${minOf(companies.size, COMPANY_CAP)} shown of ${companies.size} companies in today's sweep") }
        items(companies.take(COMPANY_CAP), key = { it.first }) { (name, ps) ->
            MJob(
                title = name,
                company = "${ps.size} open today  ·  ${ps.count { it.remote_policy == "remote" }} remote",
                policy = null,
                onClick = ps.firstOrNull { it.url.isNotEmpty() }?.url?.let { u -> ({ onOpen(u) }) },
            )
        }
        item { MFoot(onOpen) }
        return
    }
    item { MCount("${rows.size} of ${feed?.postings?.size ?: 0}") }
    /* A search that matches nothing used to leave "0 of 309" over an empty screen
       with no way out — the same dead end as the empty matches frame. Say what
       happened and offer the way back. */
    if (rows.isEmpty() && feed != null) item {
        Column {
            Text(
                if (words.isEmpty()) "Nothing in today's sweep fits that filter."
                else "Nothing in today's ${feed.passers.size} postings matches “$query”.",
                color = T.text2, fontSize = 14.sp, lineHeight = 21.sp,
            )
            Spacer(Modifier.height(12.dp))
            MFilter("Clear and see all ${feed.passers.size}", on = false) { onPolicy(null); onClear() }
        }
    }
    undo?.let { (_, title) ->
        item {
            Row(
                Modifier.fillMaxWidth().clip(Pill).background(T.chip)
                    .border(1.dp, T.hair, Pill).padding(horizontal = 14.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Dismissed “$title”", fontSize = 12.5.sp, color = T.text2,
                     modifier = Modifier.weight(1f), maxLines = 1)
                MFilter("Undo", on = false, onClick = onUndo)
            }
        }
    }
    // Same hole as the web had: a browse row that does nothing when tapped.
    items(rows, key = { it.id }) { p ->
        MJob(p.title, p.company, policy = p.remote_policy,
             onClick = p.url.takeIf { it.isNotEmpty() }?.let { u -> ({ onOpen(u) }) },
             onDismiss = { onDismiss(p.id, p.title) })
    }
}

/* ── frame 3: After a run ─────────────────────────────────────────────────
   The scored eight, each carrying its rose and its band. */
private fun LazyListScope.matches(
    ui: Ui, feed: Feed?, vm: DemoVm, onRework: () -> Unit, onOpen: (String) -> Unit,
) {
    val byId = feed?.passers?.associateBy { it.id } ?: emptyMap()
    val sorted = ui.scores.sortedByDescending { it.fit }

    item { MTitle("Your matches") }
    item { MCount("${sorted.size} survived the gate of ${feed?.postings?.size ?: 0}") }
    /* A run kept from another day is still useful — the reader decides. It is
       never passed off as today's. */
    ui.runStale?.let { item { MCount(it, Modifier.padding(top = 2.dp)) } }

    /* Below the floor nothing is recommended — and that used to be the end of
       it: one sentence and eight cards with no action on any of them. The
       recommendation is unchanged; what follows it is three routes instead of
       a full stop, the same three the web carries. */
    val clears = sorted.any { it.fit >= FIT_FLOOR }
    if (!clears && sorted.isNotEmpty()) item {
        NoFit(
            near = sorted.first().fit,
            asks = sorted.take(3).mapNotNull { s ->
                s.weakest.takeIf { it.isNotBlank() }?.let { (byId[s.id]?.title ?: s.id) to it }
            },
            stretch = ui.stretch,
            onRework = onRework,
            onStretch = { vm.allowStretch() },
        )
    }
    items(sorted, key = { it.id }) { s ->
        val p = byId[s.id]
        // Below the floor the card acts only once the candidate has asked it to.
        val open = p != null && !ui.fromCache && (s.fit >= FIT_FLOOR || ui.stretch)
        MJob(
            title = p?.title ?: s.id,
            company = p?.company.orEmpty(),
            fit = s.fit,
            verdict = s.verdict,
            strongest = s.strongest,
            weakest = s.weakest,
            saved = ui.tracker.containsKey(s.id),
            onSave = {
                if (ui.tracker.containsKey(s.id)) vm.untrack(s.id)
                else vm.setStage(trackedFor(s, p), "survivor")
            },
            onClick = if (open) ({ vm.openApply(p!!) }) else null,
            // Same wording as the web's card, and shown on exactly the cards that
            // can act on it — a stretch is named as one, never as the recommendation.
            action = if (!open) null else if (s.fit >= FIT_FLOOR) "Prepare application →" else "Apply anyway →",
        )
    }
    item { MFoot(onOpen) }
}

/** onsite covers everything that is neither remote nor hybrid, including unstated. */
private fun matchesPolicy(p: Posting, id: String): Boolean = when (id) {
    "remote" -> p.remote_policy == "remote"
    "hybrid" -> p.remote_policy == "hybrid"
    else -> p.remote_policy != "remote" && p.remote_policy != "hybrid"
}

/* The brand mark: August's geometry (8 dots on a ring at r=11) with OUR one
   difference — radii graduate clockwise from bearing 000, so it reads as a
   sweep rather than a wheel.

   CROPPED, deliberately (BrandKit v2.2, Mark Decision B). I briefly uncropped
   this on the grounds that the site header does not clip; the decision doc is
   explicit that the crop IS the mark — it is the silhouette, it is what
   survives to 16px in a favicon, a launcher and an avatar, and uncropped
   "below about 30px is a ring of dots, a loading spinner, not a mark". This
   draws at 18dp in the lockup, which is that case exactly. The uncropped cut
   is the documented DISPLAY variant: large, with room, and in the fit states.

   The ramp is the canonical 2.275 -> 4.336 from tokens/brand.json, and the
   two largest dots touching at 270 and 315 is DELIBERATE — "the sweep closing
   on itself". I briefly cut the max to 4.089 on the strength of the decision
   doc's comparison table, which was me overruling a decision the token source
   had already made and given a reason for. The display cut owns the touch;
   that is why it carries a 48px floor and is never used in a lockup. */
@Composable
fun Mark(dp: Dp = 28.dp, tint: Color = T.accent) {
    Canvas(Modifier.size(dp).clip(RoundedCornerShape(6.dp))) {
        val u = size.width / 24f
        val c = center
        for (i in 0 until 8) {
            val th = Math.toRadians((-90 + 45 * i).toDouble())
            val r = (2.275f + (4.336f - 2.275f) * i / 7f) * u
            drawCircle(tint, r, Offset(c.x + 11f * u * cos(th).toFloat(), c.y + 11f * u * sin(th).toFloat()))
        }
    }
}

/** The floating pill navigation: mark, wordmark, live chip, saved. */
@Composable
private fun Header(feed: Feed?, tracked: Int, onTracker: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().warmShadow(8.dp, Pill).background(T.surface, Pill)
            .padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Mark()
        Spacer(Modifier.width(10.dp))
        Text("JobScout", fontFamily = Serif, fontSize = 21.sp, color = T.ink, letterSpacing = (-0.01).em)
        Spacer(Modifier.width(10.dp))
        if (feed != null) LiveChip()
        Spacer(Modifier.weight(1f))
        TextButton(onClick = onTracker) {
            Text("Saved ($tracked)", color = T.ink, fontWeight = FontWeight.Medium, fontSize = 14.sp)
        }
    }
}

@Composable
private fun LiveChip() {
    Row(
        Modifier.background(T.bAuto.copy(alpha = .14f), Pill).padding(horizontal = 11.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).background(T.bAuto, Pill))
        Spacer(Modifier.width(6.dp))
        Text("live", color = T.bAuto, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun Hero(feed: Feed?) {
    Column(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 4.dp)) {
        Text(buildAnnotatedString {
            append("Watch an ")
            withStyle(SpanStyle(color = T.accent)) { append("LLM") }
            append(" read the job market honestly.")
        }, style = H1, color = T.ink)
        Spacer(Modifier.height(10.dp))
        Text("Real postings, scored live by Claude. Every reason shown.", color = T.text2, fontSize = 16.sp, lineHeight = 24.sp)
        Spacer(Modifier.height(6.dp))
        Text(
            if (feed?.day != null) "today's sweep · ${feed.passers.size} passed the gates · ${feed.rejects.size} did not"
            else "loading today's sweep…",
            color = T.text3, fontSize = 13.sp,
        )
    }
}

/**
 * How it works, and Privacy, without leaving the app. Both were links into a
 * browser; the privacy one especially has no business being one. The text is
 * the web pages', kept short, with the canonical policy one tap away rather
 * than duplicated in full.
 */
@Composable
private fun InfoSheet(page: String, onClose: () -> Unit) {
    val uri = LocalUriHandler.current
    val ins = WindowInsets.safeDrawing.asPaddingValues()
    val how = page == "how"
    Box(Modifier.fillMaxSize().background(T.canvas).backdrop(T.ink)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp, ins.calculateTopPadding() + 14.dp, 16.dp,
                                           ins.calculateBottomPadding() + 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (how) "How JobScout works" else "Privacy",
                        style = H2, fontSize = 24.sp, color = T.ink, modifier = Modifier.weight(1f))
                    PillButton("Close", onClick = onClose)
                }
            }
            if (how) {
                items(
                    listOf(
                        "Your resume, not a form" to
                            "Upload or paste it. It is read for one run, scored, and never stored " +
                            "\u2014 no account, no profile to keep current.",
                        "A gate before the model" to
                            "A deterministic filter drops most of the day before a single paid call. " +
                            "What survives is what could plausibly fit, and every posting set aside " +
                            "carries the reason it was.",
                        "A number and a reason" to
                            "Every survivor gets a fit from 0 to 100, a verdict in plain words, the " +
                            "strongest point and the thing to answer next. From 55 up you can have a " +
                            "cover letter, your resume rebuilt for the posting, and the screening " +
                            "questions answered from what you wrote.",
                        "You apply, never us" to
                            "JobScout does not submit anything and cannot. It opens the employer's " +
                            "own form with the answers already written, and you press send.",
                    )
                ) { (h, b) ->
                    Column(
                        Modifier.fillMaxWidth().clip(Card).background(T.surface)
                            .border(1.dp, T.hair, Card).padding(16.dp),
                    ) {
                        Text(h, style = H2, fontSize = 17.sp, color = T.ink)
                        Spacer(Modifier.height(6.dp))
                        Text(b, fontSize = 13.5.sp, lineHeight = 21.sp, color = T.text2)
                    }
                }
            } else {
                items(
                    listOf(
                        "Your resume never leaves the device it is read on" to
                            "It is sent to the scoring API for the length of one run and is not " +
                            "written to any database, any log or any file. Close the app and it is gone.",
                        "No account, and nothing that identifies you" to
                            "There is no sign-in. What is counted is which step happened and when " +
                            "\u2014 never your IP, never your resume or any part of it, never a job " +
                            "title, a company, a score, a name or an email.",
                        "Saved jobs stay on this phone" to
                            "The list, the stages and your saved searches are in this app's own " +
                            "storage. Nothing is uploaded and nothing is emailed. Uninstalling " +
                            "removes them.",
                    )
                ) { (h, b) ->
                    Column(
                        Modifier.fillMaxWidth().clip(Card).background(T.surface)
                            .border(1.dp, T.hair, Card).padding(16.dp),
                    ) {
                        Text(h, style = H2, fontSize = 17.sp, color = T.ink)
                        Spacer(Modifier.height(6.dp))
                        Text(b, fontSize = 13.5.sp, lineHeight = 21.sp, color = T.text2)
                    }
                }
                item {
                    // One document, not two kept in step by hand.
                    PillButton("Read the full policy \u2197") {
                        runCatching { uri.openUri("https://jobscout.page/privacy") }
                    }
                }
            }
        }
    }
}

/** A stage heading: the bearing pill, the serif title, the note. */
@Composable
private fun Stage(bearing: String, label: String, title: String, note: String? = null) {
    Column(Modifier.padding(top = 22.dp)) {
        Row(
            Modifier.warmShadow(6.dp, Pill).background(T.surface, Pill).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(bearing, color = T.accent, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.1.em)
            Text(" — $label", color = T.text3, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.1.em)
        }
        Spacer(Modifier.height(14.dp))
        Text(title, style = H2, color = T.ink)
        if (note != null) {
            Spacer(Modifier.height(6.dp))
            Text(note, color = T.text2, fontSize = 14.sp, lineHeight = 21.sp)
        }
    }
}

/**
 * The below-floor panel. Not a refusal with a full stop — the recommendation
 * is still "rewrite the resume", and it is still first, but the two other
 * things a candidate might reasonably want to do are now here instead of
 * nowhere.
 *
 * `asks` is quoted from the run: each of the three nearest misses already
 * carries the one thing it found missing, which is a better rewrite list than
 * anything this screen could invent.
 */
private val Ask = RoundedCornerShape(12.dp)

@Composable
private fun NoFit(
    near: Int,
    asks: List<Pair<String, String>>,
    stretch: Boolean,
    onRework: () -> Unit,
    onStretch: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().clip(Card).background(T.surface)
            .border(1.dp, T.hair, Card).padding(16.dp),
    ) {
        Text("Today's postings are a stretch for this resume as written.",
            fontSize = 14.sp, lineHeight = 21.sp, fontWeight = FontWeight.Medium, color = T.ink)
        Spacer(Modifier.height(6.dp))
        Text("The nearest was $near out of 100 \u2014 which measures the distance between what these " +
             "postings ask for and what the resume currently says, not what you are capable of. The " +
             "quickest way to move it is to make the resume answer them, and they have been unusually " +
             "clear about what they are asking:",
            fontSize = 13.sp, lineHeight = 20.sp, color = T.text2)

        asks.forEach { (title, why) ->
            Spacer(Modifier.height(10.dp))
            Column(
                Modifier.fillMaxWidth().clip(Ask).background(T.canvas2)
                    .border(1.dp, T.hair, Ask).padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Text("${title.uppercase()} \u2014 WHAT TO ANSWER", fontSize = 10.sp, letterSpacing = 0.09.em,
                    fontWeight = FontWeight.Medium, color = T.text3, maxLines = 2)
                Spacer(Modifier.height(5.dp))
                Text(why, fontSize = 12.5.sp, lineHeight = 19.sp, color = T.text2)
            }
        }

        Spacer(Modifier.height(12.dp))
        Text("Put whatever is genuinely true of you against those points and run it again \u2014 the same " +
             "experience in their words often scores very differently. Or back yourself on one of these " +
             "today: the letter leads with your strongest real evidence and the recruiter decides the rest.",
            fontSize = 13.sp, lineHeight = 20.sp, color = T.text2)

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            PillButton("Rework your resume", filled = true, onClick = onRework)
            // One way: whoever pressed this wanted it. It resets with the next run.
            if (!stretch) PillButton("Apply to these anyway", onClick = onStretch)
        }
    }
}

@Composable
private fun Banner(text: String, onRetry: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxWidth().background(Color(0xFFFFF6DC), Card).padding(14.dp)
    ) {
        Text(text, color = Color(0xFF8A6D00), fontSize = 13.sp, lineHeight = 19.sp)
        if (onRetry != null) {
            Spacer(Modifier.height(10.dp))
            PillButton("Try again", onClick = onRetry)
        }
    }
}

/** "0.7.0 is available" with one tap to the release — shown only when GitHub's tag beats the installed version. */
@Composable
private fun UpdateBar(r: LatestRelease) {
    val uri = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().background(Color(0xFFDCE4FB), Card).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text("JobScout ${r.tag_name.removePrefix("v")} is available.", color = T.ink, fontSize = 13.sp)
        PillButton("Download", filled = true) { uri.openUri(r.html_url) }
    }
}

/** "v0.7.0" vs "0.6.0": numeric, part by part; anything unparsable is never newer. */
fun isNewer(tag: String, installed: String): Boolean {
    fun parts(v: String): List<Int>? {
        return v.removePrefix("v").split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: return null }
    }
    val a = parts(tag) ?: return false
    val b = parts(installed) ?: return false
    for (i in 0 until maxOf(a.size, b.size)) {
        val x = a.getOrElse(i) { 0 }; val y = b.getOrElse(i) { 0 }
        if (x != y) return x > y
    }
    return false
}

/** Small uppercase pill — route bands, gate verdicts. */
@Composable
fun Chip(text: String, color: Color, ground: Color = color.copy(alpha = 0.16f)) {
    Text(text, color = color, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.09.em,
        maxLines = 1,
        modifier = Modifier.background(ground, Pill).padding(horizontal = 11.dp, vertical = 4.dp))
}

/** August's outlined pill; `filled` is the info-tinted state (saved, letter). */
/** "I'm in <province>" + "Remote only" — the same two controls as the web page. */
@Composable
private fun WhereRow(ui: Ui, feed: Feed, vm: DemoVm) {
    var open by remember { mutableStateOf(false) }
    val opt = feed.places.options.firstOrNull { it.code == ui.home }
    val whereLabel = opt?.label ?: if (ui.market == "ke") "anywhere in Kenya" else "anywhere in Canada"
    val all = feed.passers
    val n = all.count { takeable(it, ui.home, ui.remoteOnly) }
    Column(Modifier.padding(top = 14.dp)) {
        // One place to choose between is not a choice: the Kenya feed is already gated to Kenya,
        // so every on-site row there is in Kenya and picking it would exclude nothing.
        val pickable = feed.places.options.size > 1
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (pickable) Box {
                PillButton("Work in: $whereLabel") { open = true }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    DropdownMenuItem(
                        text = { Text(if (ui.market == "ke") "anywhere in Kenya" else "anywhere in Canada") },
                        onClick = { vm.setHome(""); open = false })
                    feed.places.options.forEach { o ->
                        DropdownMenuItem(
                            text = { Text(o.label + if (o.local > 0) "  \u2014 ${o.local} local" else "") },
                            onClick = { vm.setHome(o.code); open = false })
                    }
                }
            }
            PillButton("Remote only", filled = ui.remoteOnly) { vm.toggleRemoteOnly() }
        }
        // Silent until a control has been used. A count sitting under an untouched filter reads
        // as the result of a search nobody ran, which is why the page stopped printing one.
        val note = when {
            ui.home.isEmpty() && !ui.remoteOnly -> ""
            ui.remoteOnly -> "$n of ${all.size} \u2014 $whereLabel, remote only"
            else -> "$n of ${all.size} \u2014 $whereLabel \u00b7 ${feed.places.remote} remote" +
                (if (opt != null && opt.local > 0) " \u00b7 ${opt.local} on site there" else "")
        }
        if (note.isNotEmpty()) Text(
            note, color = T.text2, fontSize = 12.5.sp, lineHeight = 18.sp,
            modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
fun PillButton(text: String, color: Color = T.ink, filled: Boolean = false, enabled: Boolean = true,
                       onClick: () -> Unit) {
    Text(text, color = if (enabled) color else T.text3, fontSize = 13.5.sp, fontWeight = FontWeight.Medium, maxLines = 1,
        modifier = Modifier
            .clip(Pill)
            .then(if (filled) Modifier.background(T.chip) else Modifier.border(1.5.dp, T.hair2, Pill))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 17.dp, vertical = 9.dp))
}

@Composable
private fun LinkText(text: String, onClick: () -> Unit) {
    Text(text, color = T.ink, fontSize = 14.sp, fontWeight = FontWeight.Medium,
        modifier = Modifier.clip(Pill).clickable(onClick = onClick).padding(vertical = 6.dp, horizontal = 2.dp))
}

@Composable
private fun GateRow(r: Posting) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(buildAnnotatedString {
                append(r.title)
                withStyle(SpanStyle(fontWeight = FontWeight.Normal)) { append(" · ${r.company}") }
            }, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = T.text3,
                textDecoration = TextDecoration.LineThrough)
            Spacer(Modifier.height(2.dp))
            Text(r.gate.reason, fontSize = 12.5.sp, color = T.text3, lineHeight = 18.sp)
        }
        Spacer(Modifier.width(12.dp))
        Chip("REJECT", T.text2, ground = T.chip)
    }
}

@Composable
private fun ScoreCard(
    s: Score, posting: Posting?, tracked: Tracked, isSaved: Boolean, first: Boolean, canApply: Boolean,
    onStage: (String) -> Unit, onApply: () -> Unit,
) {
    val route = T.bandWord(s.fit)
    val bandColor = T.band(s.fit).first
    Column(
        Modifier
            .fillMaxWidth()
            .warmShadow(10.dp, Card)
            // the top card carries the indigo ring the web gives its first score
            .then(if (first) Modifier.border(3.dp, T.accent.copy(alpha = .16f), Card) else Modifier)
            .background(T.surface, Card)
            .padding(18.dp)
    ) {
        Row {
            BearingRose(s.fit, Modifier.padding(end = 14.dp, top = 2.dp), diameter = 84.dp)
            Column(Modifier.weight(1f)) {
                Text(buildAnnotatedString {
                    append(posting?.title ?: s.id)
                    withStyle(SpanStyle(color = T.text2, fontWeight = FontWeight.Normal)) { append(" · ${posting?.company ?: ""}") }
                }, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp, color = T.ink)
                Spacer(Modifier.height(6.dp))
                Chip(route.uppercase(), bandColor, ground = T.band(s.fit).second)
                Text(s.verdict, fontSize = 14.sp, lineHeight = 21.sp, color = T.text2, modifier = Modifier.padding(top = 6.dp))
                if (s.strongest.isNotEmpty())
                    Text("+ ${s.strongest}", fontSize = 13.sp, color = T.bAuto, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 8.dp))
                if (s.weakest.isNotEmpty())
                    Text("− ${s.weakest}", fontSize = 13.sp, color = T.bUnsure, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 2.dp))
            }
        }
        // Opening the posting IS how a user applies — the app never submits anything.
        PostingActions(tracked.stage, posting?.url.orEmpty(), onStage, tracked = isSaved)
        // One door instead of two pills. Until 2026-09-19 the card offered "Draft a
        // letter" and "Tailor the resume" side by side, which put the work before the
        // job it was for; the page holds all three steps and the posting they belong to.
        if (canApply && posting != null) Row(Modifier.padding(top = 8.dp)) {
            PillButton("Prepare application →", filled = true, onClick = onApply)
        }
    }
}

/** Save / stage chip + "View posting" link, shared by score cards and tracker rows. */
@Composable
private fun PostingActions(
    stage: String, url: String, onStage: (String) -> Unit,
    tracked: Boolean = true,
    trailing: @Composable () -> Unit = {},
) {
    val uriHandler = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().padding(top = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Untracked postings offer to be SAVED; only once kept do they get a
        // stage to move through. The tracker used to fill itself with every
        // scored posting, which made a list nobody asked for.
        if (tracked) StageChip(stage, onStage)
        else PillButton("Save", color = T.text2) { onStage("survivor") }
        if (url.isNotEmpty()) PillButton("View posting ↗") { runCatching { uriHandler.openUri(url) } }
        trailing()
    }
}

@Composable
private fun StageChip(stage: String, onStage: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        PillButton(stageLabel(stage) + " ▾", filled = true) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = T.surface) {
            STAGES.forEach { (id, label) ->
                DropdownMenuItem(text = { Text(label, color = T.ink) }, onClick = { open = false; onStage(id) })
            }
        }
    }
}

/** Full-screen tracker: tracked postings grouped by stage. Back / Close dismisses. */
@Composable
private fun TrackerScreen(
    vm: DemoVm,
    tracker: Map<String, Tracked>,
    watched: List<Watch>,
    onClose: () -> Unit,
) {
    var confirmClear by remember { mutableStateOf(false) }
    var savedOpen by remember { mutableStateOf(false) }
    // An overlay in the activity's own window, not a Dialog: a Dialog gets its own
    // window, which never received the light system-bar style, so Saved jobs
    // opened under a grey status bar with white icons. Back closes it.
    BackHandler(onBack = onClose)
    val ins = WindowInsets.safeDrawing.asPaddingValues()
    run {
        Box(Modifier.fillMaxSize().background(T.canvas).backdrop(T.ink)) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp, ins.calculateTopPadding() + 12.dp, 16.dp, ins.calculateBottomPadding() + 40.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(
                            Modifier.warmShadow(6.dp, Pill).background(T.surface, Pill).padding(horizontal = 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("270", color = T.accent, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.1.em)
                            Text(" — SAVED", color = T.text3, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.1.em)
                        }
                        Spacer(Modifier.weight(1f))
                        PillButton("Close", onClick = onClose)
                    }
                    Spacer(Modifier.height(14.dp))
                    Text("Saved jobs", style = H2, color = T.ink)
                    Spacer(Modifier.height(6.dp))
                    Text("Kept on this device only. You click Apply — JobScout never does.", color = T.text2, fontSize = 14.sp, lineHeight = 21.sp)
                }
                if (tracker.isEmpty())
                    item { Text("Nothing saved yet — tap Save on a score to keep it.", color = T.text3, fontSize = 14.sp) }
                // A few, then the rest behind a tap - an unbounded saved list is
                // the thing that made this unreadable in the first place.
                val all = tracker.values.sortedByDescending { it.fit }
                val rows = if (savedOpen) all else all.take(SAVED_SHOWN)
                items(rows, key = { it.id }) { t -> TrackedRow(t, vm) }
                if (all.size > SAVED_SHOWN) item {
                    PillButton(if (savedOpen) "show fewer" else "show the other ${all.size - SAVED_SHOWN}") { savedOpen = !savedOpen }
                }
                if (tracker.isNotEmpty())
                    item { LinkText("Clear all") { confirmClear = true } }

                /* Searches being watched, the same list the web's Saved page
                   shows. Nothing is emailed; each is a way back to that slice. */
                if (watched.isNotEmpty()) {
                    item {
                        Spacer(Modifier.height(10.dp))
                        Text("Searches you saved", style = H2, fontSize = 19.sp, color = T.ink)
                        Spacer(Modifier.height(4.dp))
                        Text("Kept on this device. Nothing is emailed.",
                             color = T.text3, fontSize = 13.sp, lineHeight = 19.sp)
                    }
                    items(watched, key = { it.key }) { w ->
                        Row(
                            Modifier.fillMaxWidth().background(T.surface, Pill)
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(w.human, color = T.ink, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                                Text(
                                    "watching since ${w.at}" + if (w.market == "ke") "  ·  Kenya" else "",
                                    color = T.text3, fontSize = 12.sp,
                                )
                            }
                            LinkText("remove") { vm.toggleWatch(w.key, w.human, w.sector) }
                        }
                    }
                }
            }
        }
        if (confirmClear) AlertDialog(
            onDismissRequest = { confirmClear = false },
            containerColor = T.surface, shape = Card,
            confirmButton = {
                TextButton(onClick = { vm.clearTracker(); confirmClear = false }) { Text("Clear", color = T.bUnsure) }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel", color = T.ink) } },
            title = { Text("Clear saved jobs?", style = H2, fontSize = 24.sp, color = T.ink) },
            text = { Text("Removes all ${tracker.size} saved postings from this device.", color = T.text2) },
        )
    }
}

@Composable
private fun TrackedRow(t: Tracked, vm: DemoVm) {
    Column(
        Modifier.fillMaxWidth().warmShadow(8.dp, Card).background(T.surface, Card).padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(buildAnnotatedString {
                append(t.title)
                withStyle(SpanStyle(color = T.text2, fontWeight = FontWeight.Normal)) { append(" · ${t.company}") }
            }, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 21.sp, color = T.ink, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(12.dp))
            Text("${t.fit}", color = T.band(t.fit).first, fontFamily = Serif, fontSize = 24.sp)
        }
        PostingActions(t.stage, t.url, onStage = { vm.setStage(t, it) }) {
            LinkText("remove ×") { vm.untrack(t.id) }
        }
    }
}
