package trade.tbot.jobscout

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONArray
import org.json.JSONObject
import trade.tbot.jobscout.design.Space
import trade.tbot.jobscout.design.Type
import java.io.File

/*
 * THE APPLY KIT. Ken, 2026-09-30, after a session with Shyro: "You re-create
 * docs, then you have to download them onto your phone, before you can open the
 * external application link then hopefully upload the docs one after the other.
 * As for those screening questions, they only auto-fill one or two lines and
 * then you have to fill in everything else, copy it and still re-fill the actual
 * application form."
 *
 * Mirrors site/apply.html: your details (asked once, kept on this phone), the
 * résumé and letter as real .docx files, and the employer's form opened INSIDE
 * the app with the boxes filled. Pressing Submit stays the candidate's.
 */

/** Your details: what every form asks and no résumé says. On this phone only (site/privacy.html). */
object DetailsStore {
    private const val KEY = "jobscout.details"     // the web's localStorage key
    /** key → label, the web's #s-details order and words. */
    val FIELDS = listOf(
        "name" to "Full name", "email" to "Email", "phone" to "Phone", "location" to "Where you live",
        "work_auth" to "Can you work where the job is?", "sponsorship" to "Need visa sponsorship?",
        "notice" to "Notice period / earliest start", "years" to "Years of experience",
        "linkedin" to "LinkedIn", "portfolio" to "Portfolio or GitHub",
        "salary" to "Salary expectation (only if a form asks)",
    )
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE)
    fun load(ctx: Context): Map<String, String> = runCatching {
        val o = JSONObject(prefs(ctx).getString(KEY, null) ?: return@runCatching emptyMap())
        FIELDS.mapNotNull { (k, _) -> o.optString(k).trim().takeIf { it.isNotEmpty() }?.let { k to it } }.toMap()
    }.getOrDefault(emptyMap())
    fun save(ctx: Context, d: Map<String, String>) = prefs(ctx).edit().apply {
        val kept = d.filterValues { it.isNotBlank() }
        if (kept.isEmpty()) remove(KEY) else putString(KEY, JSONObject(kept).toString())
    }.apply()
}

/** The documents this application has, as (file name, bytes). */
fun kitFiles(a: Apply): List<Pair<String, ByteArray>> = buildList {
    val slug = jobSlug(a.posting)
    a.resume.data?.let { add("resume-$slug.docx" to Docx.resume(it)) }
    a.letter.data?.let { add("cover-letter-$slug.docx" to Docx.letter(it)) }
}

/**
 * Saves into Downloads/JobScout, where every ATS app and the phone's own file
 * picker look first. Returns where it went, in words, or throws.
 */
fun saveToDownloads(ctx: Context, files: List<Pair<String, ByteArray>>): String {
    if (Build.VERSION.SDK_INT >= 29) {
        val cr = ctx.contentResolver
        files.forEach { (name, bytes) ->
            val v = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, DOCX_MIME)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/JobScout")
            }
            val uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: error("Downloads refused $name")
            cr.openOutputStream(uri)?.use { it.write(bytes) } ?: error("could not write $name")
        }
        return "Downloads/JobScout"
    }
    // ponytail: Android 8–9 would need a storage permission for the shared Downloads folder;
    // the app's own Downloads folder needs none. Add the permission if 8–9 users ask for it.
    val dir = File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "JobScout").apply { mkdirs() }
    files.forEach { (name, bytes) -> File(dir, name).writeBytes(bytes) }
    return "Android/data/${ctx.packageName}/files/Download/JobScout"
}

/** What the in-app filler types: their questions as answered, then your details under the labels forms use. */
fun fillPairs(a: Apply, d: Map<String, String>): List<Pair<String, String>> = buildList {
    a.answers.data?.questions?.forEach { if (it.answer.isNotBlank()) add(it.label to it.answer) }
    d["name"]?.let { n ->
        val parts = n.trim().split(Regex("\\s+"))
        add("First name" to parts.first()); if (parts.size > 1) add("Last name" to parts.drop(1).joinToString(" "))
        add("Full name" to n); add("Name" to n)
    }
    d["email"]?.let { add("Email" to it) }
    d["phone"]?.let { add("Phone" to it) }
    d["location"]?.let { add("Location" to it); add("Location (City)" to it); add("Current location" to it) }
    d["linkedin"]?.let { add("LinkedIn" to it); add("LinkedIn profile" to it) }
    d["portfolio"]?.let { add("Website" to it); add("Portfolio" to it); add("GitHub" to it) }
}

/*
 * The filler. Text boxes only: React forms (Greenhouse, Ashby) ignore a plain
 * `.value =`, so the native setter is called and input/change are fired. A box
 * that already holds something is never overwritten, and nothing is ever
 * submitted. Choices drawn as custom dropdowns stay the candidate's tap.
 */
private const val FILL_JS = """
(function(Q){
  var norm=function(s){return (s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();};
  var setVal=function(el,v){
    var proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:el.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,"value").set.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));
  };
  var labelOf=function(el){
    var t="";
    if(el.id){var l=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l)t=l.textContent;}
    if(!t){var c=el.closest("label");if(c)t=c.textContent;}
    if(!t)t=el.getAttribute("aria-label")||"";
    if(!t){var lb=el.getAttribute("aria-labelledby");if(lb)t=lb.split(" ").map(function(i){var e=document.getElementById(i);return e?e.textContent:"";}).join(" ");}
    if(!t)t=el.placeholder||el.name||"";
    return norm(t);
  };
  var fields=[].slice.call(document.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([role=combobox]),textarea,select'));
  var n=0,used=[];
  Q.forEach(function(q){
    var want=norm(q[0]),v=q[1];if(!want||!v)return;
    var el=fields.find(function(f){if(used.indexOf(f)>=0)return false;var l=labelOf(f);return l&&(l===want||l.indexOf(want)===0||want.indexOf(l)===0);});
    if(!el||el.value)return;
    used.push(el);
    if(el.tagName==="SELECT"){
      var o=[].slice.call(el.options).find(function(o){return norm(o.text)===norm(v);})||[].slice.call(el.options).find(function(o){return norm(o.text).indexOf(norm(v))===0;});
      if(o){setVal(el,o.value);n++;}return;
    }
    setVal(el,v);n++;
  });
  /* which file box was tapped: a cover-letter box gets the letter, every other the résumé */
  if(!window.__jsKit){window.__jsKit=1;
    document.addEventListener("pointerdown",function(e){
      var t=e.target;while(t&&t!==document.body&&!(t.querySelector&&t.querySelector("input[type=file]")))t=t.parentElement;
      JobScoutKit.tapped(t&&t.textContent?t.textContent.slice(0,200):"");
    },true);}
  return n;
})
"""

/**
 * The employer's form, inside the app, filled to the review screen. The file
 * button hands over the .docx already built for this job, so nothing is
 * downloaded and picked back out of Downloads.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun FormFill(url: String, pairs: List<Pair<String, String>>, files: List<Pair<String, ByteArray>>, onClose: () -> Unit) {
    val ctx = LocalContext.current
    var filled by remember { mutableStateOf<Int?>(null) }
    var web by remember { mutableStateOf<WebView?>(null) }
    var pending by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val lastTap = remember { arrayOf("") }
    DisposableEffect(Unit) { onDispose { web?.destroy() } }
    val q = remember(pairs) { JSONArray(pairs.map { JSONArray(listOf(it.first, it.second)) }).toString() }
    val fill = { w: WebView -> w.evaluateJavascript("($FILL_JS)($q)") { r -> r?.toIntOrNull()?.let { filled = maxOf(filled ?: 0, it) } } }
    // No built file for this box (a letter box before a letter exists): the phone's own picker.
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        pending?.onReceiveValue(uri?.let { arrayOf(it) }); pending = null
    }
    Column(Modifier.fillMaxSize().background(T.canvas).padding(WindowInsets.safeDrawing.asPaddingValues())) {
        Row(Modifier.fillMaxWidth().padding(Space.s2), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            MButton("← Back", primary = false, onClick = onClose)
            Spacer(Modifier.weight(1f))
            MButton("Fill again", primary = false) { web?.let(fill) }
        }
        Text(
            (filled?.let { "$it box${if (it == 1) "" else "es"} filled from your answers and details. " } ?: "Filling the boxes it can… ") +
                "Check every answer, tap the file buttons to attach the résumé and letter built for this job, then press Submit yourself.",
            color = T.text2, fontSize = Type.t1, lineHeight = 17.sp,
            modifier = Modifier.padding(horizontal = Space.s3, vertical = Space.s1),
        )
        AndroidView(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            factory = { c ->
                WebView(c).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    // The page learns only which box was tapped; it cannot reach anything else of ours.
                    addJavascriptInterface(object { @JavascriptInterface fun tapped(label: String) { lastTap[0] = label } }, "JobScoutKit")
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView, u: String?) {
                            // Greenhouse and Ashby draw the form after load: try again as it appears.
                            listOf(0L, 1500L, 4000L).forEach { d -> view.postDelayed({ fill(view) }, d) }
                        }
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                            val letter = Regex("cover", RegexOption.IGNORE_CASE).containsMatchIn(lastTap[0])
                            val f = files.firstOrNull { it.first.startsWith(if (letter) "cover-letter" else "resume") }
                            if (f == null) {
                                pending = cb
                                runCatching { picker.launch(arrayOf("*/*")) }.onFailure { cb.onReceiveValue(null); pending = null }
                                return true
                            }
                            val out = File(File(ctx.cacheDir, "kit").apply { mkdirs() }, f.first).apply { writeBytes(f.second) }
                            cb.onReceiveValue(arrayOf(Uri.fromFile(out)))
                            return true
                        }
                    }
                    loadUrl(url)
                    web = this
                }
            },
        )
    }
}
