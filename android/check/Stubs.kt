package trade.tbot.jobscout

// Only what Select.kt reads, so the picker can be compiled and run off a phone.
// The real ones live in Api.kt and carry kotlinx.serialization annotations.

data class Gate(val verdict: String = "")

data class Posting(
    val id: String = "",
    val title: String = "",
    val company: String = "",
    val remote_policy: String = "remote",
    val summary: String = "",
    val gate: Gate = Gate(),
    val sector: String = "",
    val places: List<String> = emptyList(),
)

data class Feed(
    val postings: List<Posting> = emptyList(),
    val lexicon: Map<String, List<String>> = emptyMap(),
    val labels: Map<String, String> = emptyMap(),
) {
    val passers: List<Posting> get() = postings.filter { it.gate.verdict != "reject" }
}
