package trade.tbot.jobscout

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Pipeline stages in order — the ids are the storage contract shared with the web and iOS clients. */
val STAGES = listOf(
    "survivor" to "Gate survivor",
    "applied" to "Applied",
    "pending" to "Pending",
    "responded" to "Responded",
    "interviewed" to "Interviewed",
    "callback" to "Callback",
)

fun stageLabel(id: String): String = STAGES.firstOrNull { it.first == id }?.second ?: id

@Serializable
data class Tracked(
    val id: String = "",
    val title: String = "",
    val company: String = "",
    val url: String = "",
    val fit: Int = 0,
    val stage: String = "survivor",
    val updated: String = "",
)

/** What a score card tracks — same title/company fallbacks the card displays. */
fun trackedFor(s: Score, p: Posting?): Tracked =
    Tracked(s.id, p?.title ?: s.id, p?.company.orEmpty(), p?.url.orEmpty(), s.fit)

@Serializable private data class TrackerFile(val v: Int = 1, val items: Map<String, Tracked> = emptyMap())

/**
 * Per-device tracker: one JSON string in SharedPreferences, key and shape identical to
 * web localStorage / iOS UserDefaults ({"v":1,"items":{id:{…}}}). No accounts, nothing sent.
 */
object TrackerStore {
    private const val KEY = "jobscout.tracker"
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE)

    fun load(ctx: Context): Map<String, Tracked> {
        val raw = prefs(ctx).getString(KEY, null) ?: return emptyMap()
        return runCatching { json.decodeFromString<TrackerFile>(raw).items }.getOrDefault(emptyMap())
    }

    fun save(ctx: Context, items: Map<String, Tracked>) =
        prefs(ctx).edit().putString(KEY, json.encodeToString(TrackerFile(items = items))).apply()
}
