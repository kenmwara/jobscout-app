package trade.tbot.jobscout

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
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
data class Feed(
    val day: String? = null,
    val generated_utc: String = "",
    val passers: List<Posting> = emptyList(),
    val rejects: List<Posting> = emptyList(),
)

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

@Serializable private data class ScoreBody(val profile: String, val postings: List<Posting>)
@Serializable private data class LetterBody(val profile: String, val posting: Posting)

object Api {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val jsonMedia = "application/json".toMediaType()
    private val http = OkHttpClient.Builder()
        .callTimeout(120, TimeUnit.SECONDS)   // 8 sequential live LLM calls behind /api/score
        .build()

    private suspend fun call(req: Request): String = withContext(Dispatchers.IO) {
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string() ?: ""
            // 429 (rate limit) still carries a JSON body the UI wants to show verbatim.
            if (!resp.isSuccessful && resp.code != 429) error("HTTP ${resp.code}")
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
}
