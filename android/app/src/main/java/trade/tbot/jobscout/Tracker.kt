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

/**
 * A scored run kept whole, and named by the résumé that earned it.
 *
 * Ken, 2026-09-23: "There's still no way to save a matched sweep, but I can
 * save individual jobs through the heart", and the part that makes it more
 * than a bookmark: "Name the sweep by the resume that earned it as one name
 * could have different resumes, thus different sweeps e.g. I've got three
 * resumes!"
 *
 * THE NAME CANNOT BE READ OFF THE RÉSUMÉ. The text is never written to
 * storage — that is the promise check_resume_privacy holds, and the reason
 * SavedRun.profile is scrubbed above — so there is nothing on disk to name a
 * sweep from. The obvious derivation would not work anyway: the first line of
 * all three of his résumés says the same name. What tells them apart is what
 * each is AIMED at, which is a judgement only he can make.
 *
 * So the reader names it once and the FINGERPRINT remembers. Every run already
 * carries `fp` — a hash of the résumé, not the résumé — so the second sweep
 * from the same résumé arrives already named and the first from a different
 * one asks. This is site/sweeps.js's logic, same keys, same cap, because a
 * reader with the app and the site open should not meet two different ideas of
 * what a kept sweep is.
 */
@Serializable
data class KeptSweep(
    val id: String = "",
    val name: String = "",
    val fp: String = "",
    val day: String = "",
    val market: String = "ca",
    val note: String = "",
    val at: String = "",
    val scores: List<Score> = emptyList(),
)

object SweepStore {
    private const val KEY = "jobscout.sweeps"
    private const val NAMES = "jobscout.sweepnames"
    const val CAP = 12          // kept sweeps; the oldest falls off
    const val NAME_MAX = 60
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE)

    fun all(ctx: Context): List<KeptSweep> {
        val raw = prefs(ctx).getString(KEY, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<KeptSweep>>(raw) }.getOrDefault(emptyList())
            .filter { it.id.isNotEmpty() }
    }

    private fun names(ctx: Context): Map<String, String> {
        val raw = prefs(ctx).getString(NAMES, null) ?: return emptyMap()
        return runCatching { json.decodeFromString<Map<String, String>>(raw) }.getOrDefault(emptyMap())
    }

    /** What this résumé's sweeps were called last time, or "". */
    fun nameFor(ctx: Context, fp: String): String = names(ctx)[fp].orEmpty()

    /* Capped, because a box beside a résumé is a box somebody will paste a
       résumé into, and this must never become the place the résumé ends up
       after everywhere else stopped keeping it. */
    private fun clean(s: String) = s.replace(Regex("\\s+"), " ").trim().take(NAME_MAX)

    private fun remember(ctx: Context, fp: String, name: String): String {
        val n = clean(name)
        if (fp.isEmpty() || n.isEmpty()) return n
        prefs(ctx).edit().putString(NAMES, json.encodeToString(names(ctx) + (fp to n))).apply()
        return n
    }

    private fun idOf(run: SavedRun) = "${run.fp.ifEmpty { "x" }}-${run.day}-${run.market}"

    fun kept(ctx: Context, run: SavedRun?): Boolean =
        run != null && run.scores.isNotEmpty() && all(ctx).any { it.id == idOf(run) }

    /**
     * Keep this run. Keeping twice from the same résumé on the same day
     * REPLACES rather than stacks: two identical rows an hour apart is a list
     * nobody can read.
     */
    fun keep(ctx: Context, run: SavedRun, note: String, name: String, today: String): KeptSweep? {
        if (run.scores.isEmpty()) return null
        val n = remember(ctx, run.fp, name).ifEmpty { clean(name) }.ifEmpty { "Unnamed résumé" }
        val rec = KeptSweep(idOf(run), n, run.fp, run.day, run.market, note, today, run.scores)
        val rest = all(ctx).filter { it.id != rec.id }
        prefs(ctx).edit().putString(KEY, json.encodeToString((listOf(rec) + rest).take(CAP))).apply()
        return rec
    }

    /** Renaming a résumé renames every sweep it earned — they are one résumé's runs. */
    fun rename(ctx: Context, fp: String, name: String) {
        val n = remember(ctx, fp, name)
        if (n.isEmpty()) return
        prefs(ctx).edit()
            .putString(KEY, json.encodeToString(all(ctx).map { if (it.fp == fp) it.copy(name = n) else it }))
            .apply()
    }

    fun remove(ctx: Context, id: String) =
        prefs(ctx).edit().putString(KEY, json.encodeToString(all(ctx).filter { it.id != id })).apply()
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
