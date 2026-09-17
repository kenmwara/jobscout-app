package trade.tbot.jobscout

import kotlinx.coroutines.Dispatchers
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
)

@Serializable
data class Counts(val pass: Int = 0, val reject: Int = 0)

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
@Serializable private data class LetterBody(val profile: String, val posting: Posting, val fit: Int)   // the worker refuses fit < FIT_FLOOR

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

    private suspend fun call(req: Request): String = withContext(Dispatchers.IO) {
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string() ?: ""
            // Worker errors (429 rate limit, 413/415/422 from /api/extract) carry a JSON
            // {error, detail} body the UI shows verbatim; anything else is a plain failure.
            if (!resp.isSuccessful && !body.trimStart().startsWith("{")) error("HTTP ${resp.code}")
            body
        }
    }

    suspend fun feed(market: String = "ca"): Feed =
        json.decodeFromString(call(Request.Builder().url("$API_BASE/api/feed?market=$market").build()))

    suspend fun score(profile: String, postings: List<Posting>, market: String = "ca"): ScoreResponse =
        json.decodeFromString(call(
            Request.Builder().url("$API_BASE/api/score")
                .post(json.encodeToString(ScoreBody(profile, postings, market)).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun letter(profile: String, posting: Posting, fit: Int): LetterResponse =
        json.decodeFromString(call(
            Request.Builder().url("$API_BASE/api/letter")
                .post(json.encodeToString(LetterBody(profile, posting, fit)).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun tailor(profile: String, posting: Posting, fit: Int): TailorResponse =
        json.decodeFromString(call(
            Request.Builder().url("$API_BASE/api/tailor")
                .post(json.encodeToString(LetterBody(profile, posting, fit)).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun latestRelease(): LatestRelease =
        json.decodeFromString(call(
            Request.Builder().url("https://api.github.com/repos/kenmwara/jobscout-app/releases/latest")
                .header("accept", "application/vnd.github+json").build()
        ))

    /** Raw file bytes in, extracted text out. The worker never stores or logs the content. */
    suspend fun extract(bytes: ByteArray, mime: String, name: String): ExtractResponse =
        json.decodeFromString(call(
            Request.Builder().url("$API_BASE/api/extract")
                // OkHttp rejects non-ASCII header values; the name only sniffs the extension anyway.
                .header("x-filename", name.filter { it.code in 32..126 })
                // A content provider can declare a malformed type — fall back, the worker sniffs x-filename.
                .post(bytes.toRequestBody(mime.toMediaTypeOrNull() ?: octetMedia))
                .build()
        ))
}
