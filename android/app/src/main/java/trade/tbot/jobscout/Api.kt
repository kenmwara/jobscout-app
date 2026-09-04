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

/** /api/extract — resume file → text. `chars` is the length before the 6,000 cap. */
@Serializable
data class ExtractResponse(
    val text: String = "",
    val chars: Int = 0,
    val kind: String = "",
    val error: String? = null,
    val detail: String? = null,
)

@Serializable private data class ScoreBody(val profile: String, val postings: List<Posting>)
@Serializable private data class LetterBody(val profile: String, val posting: Posting)

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

    suspend fun feed(): Feed =
        json.decodeFromString(call(Request.Builder().url("$API_BASE/api/feed").build()))

    suspend fun score(profile: String, postings: List<Posting>): ScoreResponse =
        json.decodeFromString(call(
            Request.Builder().url("$API_BASE/api/score")
                .post(json.encodeToString(ScoreBody(profile, postings)).toRequestBody(jsonMedia))
                .build()
        ))

    suspend fun letter(profile: String, posting: Posting): LetterResponse =
        json.decodeFromString(call(
            Request.Builder().url("$API_BASE/api/letter")
                .post(json.encodeToString(LetterBody(profile, posting)).toRequestBody(jsonMedia))
                .build()
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
