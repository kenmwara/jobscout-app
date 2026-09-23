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
    "declined" to "Declined",   // a no is an outcome; the set had no way to say it
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
/**
 * A search the candidate wants to come back to. The web's bell used to promise
 * an email nothing sends; it keeps a search on the device instead, and so does
 * this. Nothing is transmitted and nothing claims to be.
 */
@Serializable
data class Watch(
    val key: String = "",
    val human: String = "",
    val market: String = "ca",
    val sector: String = "",
    val at: String = "",
)

@Serializable
private data class WatchFile(val v: Int = 1, val items: List<Watch> = emptyList())

object WatchStore {
    private const val KEY = "jobscout.watch"
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE)

    fun load(ctx: Context): List<Watch> {
        val raw = prefs(ctx).getString(KEY, null) ?: return emptyList()
        return runCatching { json.decodeFromString<WatchFile>(raw).items }.getOrDefault(emptyList())
    }

    fun save(ctx: Context, items: List<Watch>) =
        prefs(ctx).edit().putString(KEY, json.encodeToString(WatchFile(items = items))).apply()
}

/**
 * The last run, kept so that closing the app does not cost eight Claude calls.
 *
 * `day` is the sweep the scores were about and `fp` a cheap hash of the resume
 * they were scored from. Neither is a lock: a run from another day is still
 * shown, with a line saying so, because the reader decides whether yesterday
 * still helps. A run from a DIFFERENT RESUME is not shown at all — that one is
 * not a judgement call, it is simply the wrong answer.
 */
@Serializable
data class SavedRun(
    val day: String = "",
    val market: String = "ca",
    val fp: String = "",
    val profile: String = "",
    val scores: List<Score> = emptyList(),
)

/** Cheap and stable, and the same djb2 the web uses so the two agree. */
fun fingerprint(text: String): String {
    var h = 5381
    for (c in text) h = (h shl 5) + h + c.code
    return (h.toLong() and 0xFFFFFFFFL).toString() + "." + text.length
}

object RunStore {
    private const val KEY = "jobscout.run"
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE)

    fun load(ctx: Context): SavedRun? {
        val raw = prefs(ctx).getString(KEY, null) ?: return null
        val run = runCatching { json.decodeFromString<SavedRun>(raw) }.getOrNull()
            ?.takeIf { it.scores.isNotEmpty() }
        // SCRUB A RECORD WRITTEN BEFORE 2026-09-23. Until then `profile` carried
        // the whole resume in plain text, and every phone that ever ran this app
        // still has one sitting in SharedPreferences. Stopping the write only
        // helps the next run; this clears what is already there, on the next
        // launch, without waiting for one. The web does the same for its own
        // pre-09-21 records.
        if (run != null && run.profile.isNotEmpty()) {
            val clean = run.copy(profile = "")
            save(ctx, clean)
            return clean
        }
        return run
    }

    fun save(ctx: Context, run: SavedRun?) = prefs(ctx).edit().let { e ->
        if (run == null) e.remove(KEY) else e.putString(KEY, json.encodeToString(run))
        e.apply()
    }
}

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
