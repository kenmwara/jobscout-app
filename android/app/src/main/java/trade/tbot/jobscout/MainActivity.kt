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
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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

// ── Brand kit v2.0 - August Health language ──────────────────────────────────────────────────────────
val Indigo = Color(0xFF4865FF)
val MidnightViolet = Color(0xFF1B1463)
val Ink = Color(0xFF080331)
val Muted = Color(0xFF4A4560)
val CanvasBg = Color(0xFFF8F3EB)
val CardBg = Color.White
val Hairline = Color(0xFFE7E2DA)

/** One hue per candidate (border + rose) and its card ground, same as the web. */
val PERSONA_HUES = listOf(
    Color(0xFF328A3B) to Color(0xFFF2F7F1),   // forest
    Color(0xFFCC3600) to Color(0xFFFDF3EE),   // ember deep
    Color(0xFF4865FF) to Color(0xFFF1F3FD),   // indigo
)

data class Persona(val id: String, val name: String, val desc: String, val profile: String)

// Same three personas as the web demo — one candidate lens per run.
val PERSONAS = listOf(
    Persona("maya", "Maya — Senior Platform Engineer",
        "Vancouver · Canadian PR · remote-only · Python/TypeScript, Cloudflare, LLM orchestration",
        "Senior platform engineer in Vancouver, BC (Canadian PR; no US work authorization — US roles must allow remote-from-Canada). 8 years: Python, TypeScript, Cloudflare Workers/D1, DigitalOcean, FastAPI, nginx. Builds and operates LLM-orchestrated production systems (Claude API) end-to-end solo: trading platform, audit pipelines, edge APIs. Wants: senior/staff platform or AI-infrastructure roles, fully remote."),
    Persona("dev", "Dev — New-grad SWE",
        "Toronto · React/Node internships · hybrid OK · first full-time role",
        "New-grad software engineer in Toronto, ON (Canadian citizen). BSc CS 2026. Two internships: React/Next.js front-end at a fintech, Node/Express APIs at a startup. Comfortable with TypeScript, Postgres, basic AWS. Looking for: junior/new-grad full-stack or front-end roles, Toronto hybrid or remote-Canada."),
    Persona("ingrid", "Ingrid — Data Scientist",
        "Berlin · EU work auth · Python/ML · remote EU or hybrid Berlin",
        "Data scientist in Berlin, Germany (EU work authorization only). 5 years: Python, pandas, scikit-learn, PyTorch, SQL, dbt; production ML for churn and pricing at a marketplace. Strong experimentation/causal inference. Looking for: senior data science or ML engineer roles, remote within EU or hybrid Berlin. No relocation."),
)

enum class Phase { IDLE, GATES, SCORING, DONE }

/** How many gate verdicts stream before the rest go behind a tap. Matches the web. */
const val GATE_STREAM = 6

/** How many saved jobs list before the rest go behind a tap. Matches the web. */
const val SAVED_SHOWN = 4

data class Ui(
    val feed: Feed? = null,
    val personaIdx: Int = 0,
    val resume: String = "",          // pasted/extracted resume text — in-memory only, never persisted
    val uploading: Boolean = false,
    val uploadStatus: String? = null,
    val phase: Phase = Phase.IDLE,
    val gatesShown: Int = 0,
    val scores: List<Score> = emptyList(),
    val meta: Meta? = null,
    val fromCache: Boolean = false,
    val banner: String? = null,
    val letterText: String? = null,
    val letterBusy: Boolean = false,
    val error: String? = null,
    val tracker: Map<String, Tracked> = emptyMap(),   // per-device pipeline — the only thing persisted
)

class DemoVm(app: Application) : AndroidViewModel(app) {
    private val _ui = MutableStateFlow(Ui(tracker = TrackerStore.load(app)))
    val ui = _ui.asStateFlow()

    init { loadFeed() }

    /** Retry path for a failed first load - without this the only fix is a force-quit. */
    fun loadFeed() {
        _ui.update { it.copy(error = null) }
        viewModelScope.launch {
            runCatching { Api.feed() }
                .onSuccess { f -> _ui.update { it.copy(feed = f, error = null) } }
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
            "No internet connection \u2014 JobScout can't reach the feed."
        is SocketTimeoutException ->
            "The connection timed out. Try again in a moment."
        is SSLException ->
            "Couldn't establish a secure connection."
        else -> "Feed unavailable: ${e.message ?: e::class.java.simpleName}"
    }

    fun pick(i: Int) = _ui.update { it.copy(personaIdx = i) }
    fun setResume(s: String) = _ui.update { it.copy(resume = s.take(6000)) }

    /** Same rule as the web demo: pasted text wins once it is longer than 40 chars, else the persona. */
    private fun profileText(): String {
        val own = _ui.value.resume.trim()
        return if (own.length > 40) own else PERSONAS[_ui.value.personaIdx].profile
    }

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

    fun run() {
        val feed = _ui.value.feed ?: return
        if (_ui.value.phase == Phase.GATES || _ui.value.phase == Phase.SCORING) return
        viewModelScope.launch {
            _ui.update { it.copy(phase = Phase.GATES, gatesShown = 0, scores = emptyList(),
                                 meta = null, banner = null, fromCache = false) }
            repeat(minOf(feed.rejects.size, GATE_STREAM) + 1) {
                delay(160)
                _ui.update { s -> s.copy(gatesShown = s.gatesShown + 1) }
            }
            _ui.update { it.copy(phase = Phase.SCORING) }
            val profile = profileText()
            runCatching { Api.score(profile, feed.passers.take(8)) }
                .onSuccess { r ->
                    when {
                        r.breaker -> {
                            val cached = r.cached?.scores ?: emptyList()
                            _ui.update { it.copy(phase = Phase.DONE, banner = r.detail,
                                scores = cached, meta = r.cached?.meta, fromCache = true) }
                        }
                        r.error != null -> _ui.update { it.copy(phase = Phase.DONE, banner = r.detail ?: r.error) }
                        else -> {
                            _ui.update { it.copy(phase = Phase.DONE, scores = r.scores, meta = r.meta) }
                        }
                    }
                }
                .onFailure { e -> _ui.update { it.copy(phase = Phase.DONE, banner = "Scoring failed: ${e.message}") } }
        }
    }

    fun draftLetter(posting: Posting) {
        val profile = profileText()
        viewModelScope.launch {
            _ui.update { it.copy(letterBusy = true, letterText = null) }
            runCatching { Api.letter(profile, posting) }
                .onSuccess { r ->
                    _ui.update { it.copy(letterBusy = false,
                        letterText = if (r.breaker || r.error != null) (r.detail ?: "Unavailable.") else r.letter) }
                }
                .onFailure { e -> _ui.update { it.copy(letterBusy = false, letterText = "Letter failed: ${e.message}") } }
        }
    }

    fun dismissLetter() = _ui.update { it.copy(letterText = null, letterBusy = false) }

    // ── Tracker (per device, persisted on every change) ──────────────────────
    private fun setTracker(items: Map<String, Tracked>) {
        _ui.update { it.copy(tracker = items) }
        TrackerStore.save(getApplication<Application>(), items)
    }

    /** Upserts; a posting not yet tracked (e.g. removed, then re-staged from its card) enters at that stage. */
    fun setStage(item: Tracked, stage: String) =
        setTracker(_ui.value.tracker + (item.id to item.copy(stage = stage, updated = Instant.now().toString())))

    fun untrack(id: String) = setTracker(_ui.value.tracker - id)
    fun clearTracker() = setTracker(emptyMap())

}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Indigo, onPrimary = Color.White,
                    background = CanvasBg, surface = CardBg, onSurface = Ink,
                )
            ) { DemoScreen() }
        }
    }
}

private val RESUME_MIMES = arrayOf(
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
)

@Composable
fun DemoScreen(vm: DemoVm = viewModel()) {
    val ui by vm.ui.collectAsState()
    val feed = ui.feed
    var ownOpen by remember { mutableStateOf(false) }
    var trackerOpen by remember { mutableStateOf(false) }
    var gatesOpen by remember { mutableStateOf(false) }
    val usingOwn = ui.resume.trim().length > 40

    LazyColumn(
        Modifier.fillMaxSize().background(CanvasBg),
        contentPadding = PaddingValues(16.dp, 24.dp, 16.dp, 40.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Header(feed, ui.tracker.size) { trackerOpen = true } }
        ui.error?.let { item { Banner(it, onRetry = { vm.loadFeed() }) } }

        item { SectionLabel("000 · WHO'S LOOKING?") }
        itemsIndexed(PERSONAS) { i, p ->
            PersonaCard(p, index = i, selected = i == ui.personaIdx && !usingOwn) { vm.pick(i) }
        }
        item {
            // Same affordance as the web demo: hidden behind a toggle, processed in memory only.
            TextButton(onClick = { ownOpen = !ownOpen }, contentPadding = PaddingValues(0.dp)) {
                Text(if (ownOpen) "Hide resume box" else "or use your own resume", color = MidnightViolet, fontSize = 14.sp)
            }
            if (ownOpen) {
                // Storage Access Framework picker — no storage permission, the user picks one document.
                val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
                    uri?.let(vm::importResume)
                }
                OutlinedButton(
                    onClick = { picker.launch(RESUME_MIMES) },
                    enabled = !ui.uploading,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.padding(bottom = 8.dp),
                ) {
                    if (ui.uploading) {
                        CircularProgressIndicator(Modifier.size(16.dp), color = Indigo, strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (ui.uploading) "Extracting…" else "Upload resume (PDF, DOCX, TXT)")
                }
                ui.uploadStatus?.let {
                    Text(it, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 6.dp))
                }
                OutlinedTextField(
                    value = ui.resume, onValueChange = vm::setResume,
                    modifier = Modifier.fillMaxWidth(), minLines = 4, maxLines = 8,
                    placeholder = { Text("Paste plain resume text (max 6,000 chars)…", color = Muted) },
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Indigo, unfocusedBorderColor = Hairline,
                        focusedContainerColor = CardBg, unfocusedContainerColor = CardBg),
                )
                Text(
                    (if (usingOwn) "Using your own resume for this run. " else "") +
                        "Processed in memory for this run only. Never stored, never logged.",
                    color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
        item {
            Button(
                onClick = vm::run,
                enabled = feed != null && ui.phase != Phase.GATES && ui.phase != Phase.SCORING,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Indigo),
            ) {
                Text(
                    when (ui.phase) {
                        Phase.GATES -> "Running the gates…"
                        Phase.SCORING -> "Scoring live with Claude…"
                        else -> "Run the pipeline"
                    },
                    fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                )
            }
        }

        if (ui.scores.isNotEmpty() || ui.banner != null) {
            item { SectionLabel("090 · LIVE SCORING") }
            ui.banner?.let { item { Banner(it) } }
            val byId = feed?.passers?.associateBy { it.id } ?: emptyMap()
            val sorted = ui.scores.sortedByDescending { it.fit }
            itemsIndexed(sorted) { i, s ->
                val p = byId[s.id]
                val t = ui.tracker[s.id] ?: trackedFor(s, p)
                ScoreCard(s, p, t, isSaved = ui.tracker.containsKey(s.id),
                    showLetter = i == 0 && !ui.fromCache,
                    onStage = { vm.setStage(t, it) }) { vm.draftLetter(it) }
            }
        }

        if (ui.phase != Phase.IDLE && feed != null) {
            item { SectionLabel("180 · WHY THOSE, AND NOT THE REST") }
            // Six stream; the rest sit behind a tap. The full list is a wall,
            // and the point of this section lands in the first handful.
            val shown = if (gatesOpen) feed.rejects else feed.rejects.take(GATE_STREAM)
            itemsIndexed(shown) { i, r ->
                AnimatedVisibility(
                    visible = gatesOpen || i < ui.gatesShown,
                    enter = fadeIn() + slideInVertically { it / 3 },
                ) { GateRow(r) }
            }
            if (feed.rejects.size > GATE_STREAM) item {
                TextButton(onClick = { gatesOpen = !gatesOpen }, contentPadding = PaddingValues(0.dp)) {
                    Text(
                        if (gatesOpen) "hide them again"
                        else "show the other ${feed.rejects.size - GATE_STREAM} verdicts",
                        color = Indigo, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }

    if (ui.letterBusy || ui.letterText != null) {
        AlertDialog(
            onDismissRequest = vm::dismissLetter,
            confirmButton = { TextButton(onClick = vm::dismissLetter) { Text("Close", color = MidnightViolet) } },
            title = { Text("Grounded cover letter", fontWeight = FontWeight.Bold) },
            text = {
                if (ui.letterBusy) Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = Indigo, strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Text("Drafting from the profile only — it cannot invent experience…")
                } else Text(ui.letterText ?: "")
            },
        )
    }

    if (trackerOpen) TrackerScreen(vm, ui.tracker) { trackerOpen = false }
}

@Composable
private fun Header(feed: Feed?, tracked: Int, onTracker: () -> Unit) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("JobScout", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = MidnightViolet)
            Spacer(Modifier.width(10.dp))
            Chip("NATIVE", Indigo)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onTracker, contentPadding = PaddingValues(0.dp)) {
                Text("Saved ($tracked)", color = MidnightViolet, fontWeight = FontWeight.SemiBold)
            }
        }
        Text(
            if (feed?.day != null)
                "Real postings, scored live by Claude, with the reasoning shown."
            else "Loading today's sweep…",
            color = Muted, fontSize = 13.sp,
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = MidnightViolet, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp, modifier = Modifier.padding(top = 12.dp))
}

@Composable
private fun Banner(text: String, onRetry: (() -> Unit)? = null) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFFFF6DC), RoundedCornerShape(10.dp))
            .padding(12.dp)
    ) {
        Text(text, color = Color(0xFF8A6D00), fontSize = 13.sp)
        if (onRetry != null) {
            Spacer(Modifier.height(8.dp))
            Text("Try again", color = Indigo, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable { onRetry() })
        }
    }
}

@Composable
private fun Chip(text: String, color: Color) {
    Text(text, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp,
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp))
}

@Composable
private fun PersonaCard(p: Persona, index: Int, selected: Boolean, onClick: () -> Unit) {
    val (hue, ground) = PERSONA_HUES[index % PERSONA_HUES.size]
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(ground, RoundedCornerShape(14.dp))
            .border(if (selected) 2.dp else 1.dp, if (selected) hue else Hairline, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        MiniRose(selected = selected, tint = hue, modifier = Modifier.padding(bottom = 10.dp))
        Text(p.name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Ink)
        Text(p.desc, color = Muted, fontSize = 13.sp)
    }
}

@Composable
private fun GateRow(r: Posting) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(CardBg, RoundedCornerShape(10.dp))
            .border(1.dp, Hairline, RoundedCornerShape(10.dp))
            .padding(10.dp)
    ) {
        Text("✕", color = Color(0xFF333333), fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(10.dp))
        Column {
            Text("${r.title} — ${r.company}", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Ink)
            Text(r.gate.reason, fontSize = 12.sp, color = Muted)
        }
    }
}

@Composable
private fun ScoreCard(
    s: Score, posting: Posting?, tracked: Tracked, isSaved: Boolean, showLetter: Boolean,
    onStage: (String) -> Unit, onLetter: (Posting) -> Unit,
) {
    val (route, bandColor) = bandFor(s.fit)
    Column(
        Modifier
            .fillMaxWidth()
            .background(CardBg, RoundedCornerShape(16.dp))
            .border(1.dp, Hairline, RoundedCornerShape(16.dp))
            .padding(14.dp)
    ) {
        Row {
            BearingRose(s.fit, Modifier.padding(end = 14.dp, top = 2.dp), diameter = 76.dp)
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${posting?.title ?: s.id} · ${posting?.company ?: ""}",
                        fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Ink,
                        modifier = Modifier.weight(1f),
                    )
                    Chip(route.uppercase(), bandColor)
                }
                Text(s.verdict, fontSize = 13.sp, color = Color(0xFF3A3A3C), modifier = Modifier.padding(top = 4.dp))
                if (s.strongest.isNotEmpty())
                    Text("+ ${s.strongest}", fontSize = 12.sp, color = Color(0xFF328A3B), modifier = Modifier.padding(top = 6.dp))
                if (s.weakest.isNotEmpty())
                    Text("− ${s.weakest}", fontSize = 12.sp, color = Color(0xFFFF6D39), modifier = Modifier.padding(top = 2.dp))
                if (showLetter && posting != null)
                    TextButton(onClick = { onLetter(posting) }, contentPadding = PaddingValues(0.dp)) {
                        Text("Draft a grounded cover letter →", color = MidnightViolet, fontWeight = FontWeight.SemiBold)
                    }
            }
        }
        // Opening the posting IS how a user applies — the app never submits anything.
        PostingActions(tracked.stage, posting?.url.orEmpty(), onStage, tracked = isSaved)
    }
}

/** Stage chip + "View posting" link, shared by score cards and tracker rows. */
@Composable
private fun PostingActions(
    stage: String, url: String, onStage: (String) -> Unit,
    tracked: Boolean = true,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val uriHandler = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth().padding(top = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Untracked postings offer to be SAVED; only once kept do they get a
        // stage to move through. The tracker used to fill itself with every
        // scored posting, which made a list nobody asked for.
        if (tracked) StageChip(stage, onStage)
        else TextButton(onClick = { onStage("survivor") }, contentPadding = PaddingValues(0.dp)) {
            Text("Save", color = Indigo, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        if (url.isNotEmpty())
            TextButton(onClick = { runCatching { uriHandler.openUri(url) } }, contentPadding = PaddingValues(0.dp)) {
                Text("View posting ↗", color = MidnightViolet, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

@Composable
private fun StageChip(stage: String, onStage: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        AssistChip(onClick = { open = true }, label = { Text(stageLabel(stage), fontSize = 12.sp) })
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            STAGES.forEach { (id, label) ->
                DropdownMenuItem(text = { Text(label) }, onClick = { open = false; onStage(id) })
            }
        }
    }
}

/** Full-screen tracker: tracked postings grouped by stage. Back / Close dismisses. */
@Composable
private fun TrackerScreen(vm: DemoVm, tracker: Map<String, Tracked>, onClose: () -> Unit) {
    var confirmClear by remember { mutableStateOf(false) }
    var savedOpen by remember { mutableStateOf(false) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        LazyColumn(
            Modifier.fillMaxSize().background(CanvasBg),
            contentPadding = PaddingValues(16.dp, 24.dp, 16.dp, 40.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Saved jobs", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = MidnightViolet,
                        modifier = Modifier.weight(1f))
                    TextButton(onClick = onClose) { Text("Close", color = MidnightViolet) }
                }
                Text(
                    "Kept on this device only. You click Apply — JobScout never does.",
                    color = Muted, fontSize = 12.sp,
                )
            }
            if (tracker.isEmpty())
                item { Text("Nothing saved yet — tap Save on a score to keep it.", color = Muted, fontSize = 14.sp) }
            // A few, then the rest behind a tap - an unbounded saved list is
            // the thing that made this unreadable in the first place.
            val all = tracker.values.sortedByDescending { it.fit }
            val rows = if (savedOpen) all else all.take(SAVED_SHOWN)
            items(rows, key = { it.id }) { t -> TrackedRow(t, vm) }
            if (all.size > SAVED_SHOWN) item {
                TextButton(onClick = { savedOpen = !savedOpen }, contentPadding = PaddingValues(0.dp)) {
                    Text(
                        if (savedOpen) "show fewer" else "show the other ${all.size - SAVED_SHOWN}",
                        color = Indigo, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            if (tracker.isNotEmpty())
                item {
                    TextButton(onClick = { confirmClear = true }, contentPadding = PaddingValues(0.dp)) {
                        Text("Clear all", color = Color(0xFFFF3B30))
                    }
                }
        }
        if (confirmClear) AlertDialog(
            onDismissRequest = { confirmClear = false },
            confirmButton = {
                TextButton(onClick = { vm.clearTracker(); confirmClear = false }) { Text("Clear", color = Color(0xFFFF3B30)) }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel", color = MidnightViolet) } },
            title = { Text("Clear saved jobs?", fontWeight = FontWeight.Bold) },
            text = { Text("Removes all ${tracker.size} saved postings from this device.") },
        )
    }
}

@Composable
private fun TrackedRow(t: Tracked, vm: DemoVm) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(CardBg, RoundedCornerShape(14.dp))
            .border(1.dp, Hairline, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${t.title} · ${t.company}", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Ink,
                modifier = Modifier.weight(1f))
            Text("${t.fit}", color = bandFor(t.fit).second, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
        PostingActions(t.stage, t.url, onStage = { vm.setStage(t, it) }) {
            TextButton(onClick = { vm.untrack(t.id) }, contentPadding = PaddingValues(0.dp)) {
                Text("remove ×", color = Muted, fontSize = 13.sp)
            }
        }
    }
}
