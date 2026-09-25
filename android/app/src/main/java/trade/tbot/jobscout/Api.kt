package trade.tbot.jobscout

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** Same worker API the web demo speaks — the app is another client of it. */
const val API_BASE = "https://jobscout-app-api.kenmwara.workers.dev"

/** Random per process, in memory only: it links the steps of one session and nothing else. */
private val evSid: String = buildString { repeat(12) { append("abcdefghijklmnopqrstuvwxyz0123456789".random()) } }
private val evScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

@Serializable data class Gate(val verdict: String = "", val reason: String = "")

@Serializable
data class Posting(
    val id: String = "",
    val title: String = "",
    val company: String = "",
    val location: String = "",
    val remote_policy: String = "",
    val salary: String = "",
    val url: String = "",
    val summary: String = "",
    val source: String = "",
    val gate: Gate = Gate(),
    val sector: String = "",          // from the feed's lexicon (tools/sector.py)
    val places: List<String> = emptyList(),   // province codes the location names; empty = unpinnable
)

@Serializable
data class Counts(val pass: Int = 0, val reject: Int = 0)

@Serializable
data class PlaceOption(val code: String = "", val label: String = "", val local: Int = 0)

/** remote = takeable from any of them; unplaced = requires being somewhere but names no province. */
@Serializable
data class PlacesInfo(
    val remote: Int = 0,
    val unplaced: Int = 0,
    val options: List<PlaceOption> = emptyList(),
)

@Serializable
data class Feed(
    val day: String? = null,
    val generated_utc: String = "",
    // The published feed is a single postings[] array; each item carries a
    // gate.verdict of "pass"/"reject". Split it client-side, same as the web demo.
    val postings: List<Posting> = emptyList(),
    val counts: Counts = Counts(),
    val lexicon: Map<String, List<String>> = emptyMap(),   // sector -> phrases; classifies the profile client-side
    val labels: Map<String, String> = emptyMap(),
    val places: PlacesInfo = PlacesInfo(),    // the picker's whole vocabulary, counted by the publisher
) {
    val passers: List<Posting> get() = postings.filter { it.gate.verdict != "reject" }
    val rejects: List<Posting> get() = postings.filter { it.gate.verdict == "reject" }
}

@Serializable
data class Score(
    val id: String = "",
    val fit: Int = 0,
    val verdict: String = "",
    val strongest: String = "",
    val weakest: String = "",
)

@Serializable
data class Meta(
    val model: String = "",
    val cost_usd: Double = 0.0,
    val day_spend_usd: Double = 0.0,
    val day_budget_usd: Double = 0.0,
)

@Serializable
data class CachedRun(val scores: List<Score> = emptyList(), val meta: Meta? = null)

@Serializable
data class ScoreResponse(
    val scores: List<Score> = emptyList(),
    val meta: Meta? = null,
    val breaker: Boolean = false,
    val cached: CachedRun? = null,
    val error: String? = null,
    val detail: String? = null,
)

@Serializable
data class LetterResponse(
    val letter: String = "",
    val meta: Meta? = null,
    val breaker: Boolean = false,
    val error: String? = null,
    val detail: String? = null,
)

/** /api/tailor — the profile reworded toward one posting, plus the gaps to fill only if true. */
@Serializable
data class Gap(val asks: String = "", val note: String = "")

@Serializable
data class TailorResponse(
    val summary: String = "",
    val bullets: List<String> = emptyList(),
    val gaps: List<Gap> = emptyList(),
    val meta: Meta? = null,
    val breaker: Boolean = false,
    val error: String? = null,
    val detail: String? = null,
)

/* ── /api/resume — the whole resume rewritten for one posting ──────────────
   Not /api/tailor's summary-and-bullets: this is every role, school and
   certificate the profile contains, reordered and reworded for this job, so
   each application carries a different document. The worker refuses a draft
   that names an employer, date, number or tool the profile does not, so a
   200 here is already grounded. `gaps` deliberately sit OUTSIDE the document
   — they are what the resume does not say, and only the candidate may add
   them. See worker/src/index.js. */
@Serializable data class ResumeItem(val title: String = "", val meta: String = "", val bullets: List<String> = emptyList())
@Serializable data class ResumeSection(val heading: String = "", val items: List<ResumeItem> = emptyList())

@Serializable
data class ResumeResponse(
    val name: String = "",
    val contact: String = "",
    val headline: String = "",
    val sections: List<ResumeSection> = emptyList(),
    val gaps: List<Gap> = emptyList(),
    val meta: Meta? = null,
    val breaker: Boolean = false,
    val error: String? = null,
    val invented: List<String> = emptyList(),   // error == "ungrounded": what it tried to add
    val detail: String? = null,
)

/* ── /api/answers — the employer's own screening questions ─────────────────
   Greenhouse and Ashby both publish a job's form with no key, so the
   questions can be read and answered BEFORE the posting is opened. Two
   classes are shown and never drafted: anything personal (demographics,
   salary, criminal history, passport/citizenship) and plain identity fields
   — `why` says which. `unsupported` means the board does not publish. */
@Serializable
data class Question(
    val label: String = "",
    val required: Boolean = false,
    val type: String = "",
    val options: List<String> = emptyList(),
    val answer: String = "",
    val from: String = "",      // the phrase in the profile that establishes it
    val why: String = "",       // set when it is the candidate's to answer
)

@Serializable
data class AnswersResponse(
    val source: String = "",
    val url: String = "",
    val questions: List<Question> = emptyList(),
    val drafted: Int = 0,
    val unsupported: Boolean = false,
    val host: String = "",
    val meta: Meta? = null,
    val breaker: Boolean = false,
    val error: String? = null,
    val detail: String? = null,
)

/** GitHub's latest release — the update check for sideloaded copies. Public API, no auth. */
@Serializable
data class LatestRelease(val tag_name: String = "", val html_url: String = "")

/** /api/extract — resume file → text. `chars` is the length before the 6,000 cap. */
@Serializable
data class ExtractResponse(
    val text: String = "",
    val chars: Int = 0,
    val kind: String = "",
    val error: String? = null,
    val detail: String? = null,
)

@Serializable private data class ScoreBody(val profile: String, val postings: List<Posting>, val market: String)
/* `stretch` is the candidate's explicit "apply anyway". The worker refuses
   below FIT_FLOOR without it, and with it writes a letter that names the gap
   rather than one that hides it. Derived from the fit here rather than threaded
   through four signatures: below the floor the only route to the application
   page is the opt-in, so a below-floor fit at this point already IS the
   anyway. */
@Serializable private data class LetterBody(
    val profile: String, val posting: Posting, val fit: Int,
    val stretch: Boolean = fit < FIT_FLOOR,
    /* claims the reader has already seen refused: the worker keeps them out of the rewrite */
    val exclude: List<String>? = null,
)

object Api {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val jsonMedia = "application/json".toMediaType()
    private val octetMedia = "application/octet-stream".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)    // /api/score is silent while up to 8 LLM calls run (default 10s tripped)
        .writeTimeout(30, TimeUnit.SECONDS)
        .callTimeout(120, TimeUnit.SECONDS)
        .build()

    /* Decode OFF the main thread. The GitHub releases JSON took the main thread
       past the 5 s input-dispatch limit on a cold start (ANR trace, 2026-09-21:
       "main" Runnable in StringJsonLexer via Api.latestRelease) - the
       network call was already on IO, the parse was not. */
    private suspend inline fun <reified T> decodeIO(s: String): T = withContext(Dispatchers.IO) { json.decodeFromString<T>(s) }

    private suspend fun call(req: Request): String = withContext(Dispatchers.IO) {
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string() ?: ""
            // Worker errors (429 rate limit, 413/415/422 from /api/extract) carry a JSON
            // {error, detail} body the UI shows verbatim; anything else is a plain failure.
            if (!resp.isSuccessful && !body.trimStart().startsWith("{")) error("HTTP ${resp.code}")
            body
        }
    }

    private val onEmulator = android.os.Build.HARDWARE.let { it == "ranchu" || it == "goldfish" } ||
        android.os.Build.FINGERPRINT.startsWith("generic")

    /**
     * One counted step. The same thirteen names the web page sends and the worker allows;
     * anything else is dropped server-side. Carries no resume, no posting, no device id and
     * no address, and evSid is random per process and never written to disk.
     *
     * Fire and forget: a counter must never fail a screen, so every error is swallowed.
     */
    fun ev(name: String, detail: String? = null, market: String = "ca") {
        // The emulator is where our own harness drives the app; it is not a visitor (2026-09-25).
        if (onEmulator) return
        evScope.launch {
            try {
                val d = if (detail == null) "null" else "\"" + detail.take(48) + "\""
                val body = "{\"n\":\"" + name + "\",\"d\":" + d +
                    ",\"m\":\"" + market + "\",\"s\":\"android\",\"sid\":\"" + evSid + "\"}"
                // text/plain keeps this a simple request, matching the page (see site/index.html)
                http.newCall(
                    Request.Builder().url(API_BASE + "/api/ev")
                        .post(body.toRequestBody("text/plain".toMediaType())).build()
                ).execute().close()
            } catch (_: Throwable) { }
        }
    }

    suspend fun feed(market: String = "ca"): Feed =
        decodeIO(call(Request.Builder().url("$API_BASE/api/feed?market=$market").build()))

    suspend fun score(profile: String, postings: List<Posting>, market: String = "ca"): ScoreResponse =
        decodeIO(call(
            Request.Builder().url("$API_BASE/api/score")
                .post(json.encodeToString(ScoreBody(profile, postings, market)).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun letter(profile: String, posting: Posting, fit: Int, exclude: List<String>? = null): LetterResponse =
        decodeIO(call(
            Request.Builder().url("$API_BASE/api/letter")
                .post(json.encodeToString(LetterBody(profile, posting, fit, exclude = exclude?.takeIf { it.isNotEmpty() })).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun tailor(profile: String, posting: Posting, fit: Int): TailorResponse =
        decodeIO(call(
            Request.Builder().url("$API_BASE/api/tailor")
                .post(json.encodeToString(LetterBody(profile, posting, fit)).toRequestBody(jsonMedia))
                .build()
        ))

    /** Same body as letter/tailor — the worker's one guard reads {profile, posting, fit}. */
    suspend fun resume(profile: String, posting: Posting, fit: Int, exclude: List<String>? = null): ResumeResponse =
        decodeIO(call(
            Request.Builder().url("$API_BASE/api/resume")
                .post(json.encodeToString(LetterBody(profile, posting, fit, exclude = exclude?.takeIf { it.isNotEmpty() })).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun answers(profile: String, posting: Posting, fit: Int): AnswersResponse =
        decodeIO(call(
            Request.Builder().url("$API_BASE/api/answers")
                .post(json.encodeToString(LetterBody(profile, posting, fit)).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun latestRelease(): LatestRelease =
        decodeIO(call(
            Request.Builder().url("https://api.github.com/repos/kenmwara/jobscout-app/releases/latest")
                .header("accept", "application/vnd.github+json").build()
        ))

    /** Raw file bytes in, extracted text out. The worker never stores or logs the content. */
    suspend fun extract(bytes: ByteArray, mime: String, name: String): ExtractResponse =
        decodeIO(call(
            Request.Builder().url("$API_BASE/api/extract")
                // OkHttp rejects non-ASCII header values; the name only sniffs the extension anyway.
                .header("x-filename", name.filter { it.code in 32..126 })
                // A content provider can declare a malformed type — fall back, the worker sniffs x-filename.
                .post(bytes.toRequestBody(mime.toMediaTypeOrNull() ?: octetMedia))
                .build()
        ))
}
