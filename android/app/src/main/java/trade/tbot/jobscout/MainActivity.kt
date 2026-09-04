package trade.tbot.jobscout

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── Brand kit v1.0 ──────────────────────────────────────────────────────────
val Violet = Color(0xFF7C5AFF)
val VioletDeep = Color(0xFF5A3CD2)
val Ink = Color(0xFF0E0E16)
val Muted = Color(0xFF6E6E73)
val CanvasBg = Color(0xFFF5F5F7)
val CardBg = Color.White
val Hairline = Color(0xFFE5E5EA)

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

data class Ui(
    val feed: Feed? = null,
    val personaIdx: Int = 0,
    val resume: String = "",          // pasted resume text — in-memory only, never persisted
    val phase: Phase = Phase.IDLE,
    val gatesShown: Int = 0,
    val scores: List<Score> = emptyList(),
    val meta: Meta? = null,
    val fromCache: Boolean = false,
    val banner: String? = null,
    val letterText: String? = null,
    val letterBusy: Boolean = false,
    val error: String? = null,
)

class DemoVm : ViewModel() {
    private val _ui = MutableStateFlow(Ui())
    val ui = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { Api.feed() }
                .onSuccess { f -> _ui.update { it.copy(feed = f) } }
                .onFailure { e -> _ui.update { it.copy(error = "Feed unavailable: ${e.message}") } }
        }
    }

    fun pick(i: Int) = _ui.update { it.copy(personaIdx = i) }
    fun setResume(s: String) = _ui.update { it.copy(resume = s.take(6000)) }

    /** Same rule as the web demo: pasted text wins once it is longer than 40 chars, else the persona. */
    private fun profileText(): String {
        val own = _ui.value.resume.trim()
        return if (own.length > 40) own else PERSONAS[_ui.value.personaIdx].profile
    }

    fun run() {
        val feed = _ui.value.feed ?: return
        if (_ui.value.phase == Phase.GATES || _ui.value.phase == Phase.SCORING) return
        viewModelScope.launch {
            _ui.update { it.copy(phase = Phase.GATES, gatesShown = 0, scores = emptyList(),
                                 meta = null, banner = null, fromCache = false) }
            repeat(feed.rejects.size + 1) {
                delay(160)
                _ui.update { s -> s.copy(gatesShown = s.gatesShown + 1) }
            }
            _ui.update { it.copy(phase = Phase.SCORING) }
            val profile = profileText()
            runCatching { Api.score(profile, feed.passers.take(8)) }
                .onSuccess { r ->
                    when {
                        r.breaker -> _ui.update { it.copy(phase = Phase.DONE, banner = r.detail,
                            scores = r.cached?.scores ?: emptyList(), meta = r.cached?.meta, fromCache = true) }
                        r.error != null -> _ui.update { it.copy(phase = Phase.DONE, banner = r.detail ?: r.error) }
                        else -> _ui.update { it.copy(phase = Phase.DONE, scores = r.scores, meta = r.meta) }
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
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Violet, onPrimary = Color.White,
                    background = CanvasBg, surface = CardBg, onSurface = Ink,
                )
            ) { DemoScreen() }
        }
    }
}

@Composable
fun DemoScreen(vm: DemoVm = viewModel()) {
    val ui by vm.ui.collectAsState()
    val feed = ui.feed
    var ownOpen by remember { mutableStateOf(false) }
    val usingOwn = ui.resume.trim().length > 40

    LazyColumn(
        Modifier.fillMaxSize().background(CanvasBg),
        contentPadding = PaddingValues(16.dp, 24.dp, 16.dp, 40.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Header(feed) }
        ui.error?.let { item { Banner(it) } }

        item { SectionLabel("000 · CANDIDATE") }
        itemsIndexed(PERSONAS) { i, p ->
            PersonaCard(p, selected = i == ui.personaIdx && !usingOwn) { vm.pick(i) }
        }
        item {
            // Same affordance as the web demo: hidden behind a toggle, processed in memory only.
            TextButton(onClick = { ownOpen = !ownOpen }, contentPadding = PaddingValues(0.dp)) {
                Text(if (ownOpen) "Hide resume box" else "…or paste your own resume text", color = VioletDeep, fontSize = 14.sp)
            }
            if (ownOpen) {
                OutlinedTextField(
                    value = ui.resume, onValueChange = vm::setResume,
                    modifier = Modifier.fillMaxWidth(), minLines = 4, maxLines = 8,
                    placeholder = { Text("Paste plain resume text (max 6,000 chars)…", color = Muted) },
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Violet, unfocusedBorderColor = Hairline,
                        focusedContainerColor = CardBg, unfocusedContainerColor = CardBg),
                )
                Text(
                    (if (usingOwn) "Using your pasted resume for this run. " else "") +
                        "Processed in-memory for this one scoring run. Never stored, never logged, never used for anything else.",
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
                colors = ButtonDefaults.buttonColors(containerColor = Violet),
            ) {
                Text(
                    when (ui.phase) {
                        Phase.GATES -> "Running the gates…"
                        Phase.SCORING -> "Scoring live with Claude…"
                        else -> "Run today's real sweep →"
                    },
                    fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                )
            }
        }

        if (ui.phase != Phase.IDLE && feed != null) {
            item { SectionLabel("090 · GATES BEFORE TOKENS") }
            itemsIndexed(feed.rejects) { i, r ->
                AnimatedVisibility(visible = i < ui.gatesShown, enter = fadeIn() + slideInVertically { it / 3 }) {
                    GateRow(r)
                }
            }
            item {
                AnimatedVisibility(visible = ui.gatesShown > feed.rejects.size, enter = fadeIn()) {
                    Text(
                        "✓ ${feed.passers.size} postings cleared the gates → scoring the top ${minOf(8, feed.passers.size)}",
                        color = Color(0xFF34C759), fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(vertical = 4.dp),
                    )
                }
            }
        }

        if (ui.scores.isNotEmpty() || ui.banner != null) {
            item { SectionLabel("180 · HONEST SCORES") }
            ui.banner?.let { item { Banner(it) } }
            val byId = feed?.passers?.associateBy { it.id } ?: emptyMap()
            val sorted = ui.scores.sortedByDescending { it.fit }
            itemsIndexed(sorted) { i, s ->
                ScoreCard(s, byId[s.id], showLetter = i == 0 && !ui.fromCache) { p -> vm.draftLetter(p) }
            }
            ui.meta?.let { m ->
                item {
                    Text(
                        "model ${m.model.ifEmpty { "haiku" }} · this run $${"%.4f".format(m.cost_usd)} · " +
                        "today $${"%.2f".format(m.day_spend_usd)} of $${"%.2f".format(m.day_budget_usd)} budget",
                        color = Muted, fontSize = 12.sp,
                    )
                }
            }
        }
    }

    if (ui.letterBusy || ui.letterText != null) {
        AlertDialog(
            onDismissRequest = vm::dismissLetter,
            confirmButton = { TextButton(onClick = vm::dismissLetter) { Text("Close", color = VioletDeep) } },
            title = { Text("Grounded cover letter", fontWeight = FontWeight.Bold) },
            text = {
                if (ui.letterBusy) Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = Violet, strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Text("Drafting from the profile only — it cannot invent experience…")
                } else Text(ui.letterText ?: "")
            },
        )
    }
}

@Composable
private fun Header(feed: Feed?) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("JobScout", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = VioletDeep)
            Spacer(Modifier.width(10.dp))
            Chip("NATIVE", Violet)
        }
        Text(
            if (feed?.day != null)
                "Real sweep · ${feed.day} · ${feed.passers.size} passers, ${feed.rejects.size} instructive rejects"
            else "Loading today's sweep…",
            color = Muted, fontSize = 13.sp,
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = VioletDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp, modifier = Modifier.padding(top = 12.dp))
}

@Composable
private fun Banner(text: String) {
    Text(text, color = Color(0xFF8A6D00), fontSize = 13.sp,
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFFFF6DC), RoundedCornerShape(10.dp))
            .padding(12.dp))
}

@Composable
private fun Chip(text: String, color: Color) {
    Text(text, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp,
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp))
}

@Composable
private fun PersonaCard(p: Persona, selected: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(CardBg, RoundedCornerShape(14.dp))
            .border(if (selected) 2.dp else 1.dp, if (selected) Violet else Hairline, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
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
        Text("✕", color = Color(0xFF8E8E93), fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(10.dp))
        Column {
            Text("${r.title} — ${r.company}", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Ink)
            Text(r.gate.reason, fontSize = 12.sp, color = Muted)
        }
    }
}

@Composable
private fun ScoreCard(s: Score, posting: Posting?, showLetter: Boolean, onLetter: (Posting) -> Unit) {
    val (route, bandColor) = bandFor(s.fit)
    Row(
        Modifier
            .fillMaxWidth()
            .background(CardBg, RoundedCornerShape(16.dp))
            .border(1.dp, Hairline, RoundedCornerShape(16.dp))
            .padding(14.dp)
    ) {
        BearingDial(s.fit, Modifier.padding(end = 14.dp, top = 4.dp))
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
                Text("+ ${s.strongest}", fontSize = 12.sp, color = Color(0xFF34C759), modifier = Modifier.padding(top = 6.dp))
            if (s.weakest.isNotEmpty())
                Text("− ${s.weakest}", fontSize = 12.sp, color = Color(0xFFFF9500), modifier = Modifier.padding(top = 2.dp))
            if (showLetter && posting != null)
                TextButton(onClick = { onLetter(posting) }, contentPadding = PaddingValues(0.dp)) {
                    Text("Draft a grounded cover letter →", color = VioletDeep, fontWeight = FontWeight.SemiBold)
                }
        }
    }
}
