package trade.tbot.jobscout

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/* Pure Kotlin, no Android: tools/check_docx.sh builds both documents off a phone
   and opens them as Word would. */

/** A real .docx, the web's docx()/letterDocx() byte for byte in structure: three XML parts in a zip. */
object Docx {
    private fun xe(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    fun letter(text: String): ByteArray = pack(text.trim().split(Regex("\n{2,}")).joinToString("") { par ->
        "<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"200\"/></w:pPr><w:r><w:rPr><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr>" +
            par.split("\n").mapIndexed { i, ln -> (if (i > 0) "<w:br/>" else "") + "<w:t xml:space=\"preserve\">${xe(ln)}</w:t>" }.joinToString("") +
            "</w:r></w:p>"
    })

    fun resume(r: ResumeResponse): ByteArray {
        fun para(text: String, sz: Int = 20, b: Boolean = false, i: Boolean = false, caps: Boolean = false,
                 grey: Boolean = false, ind: Boolean = false, before: Int = 0, after: Int = 60) =
            "<w:p><w:pPr>${if (ind) "<w:ind w:left=\"284\" w:hanging=\"170\"/>" else ""}" +
                "<w:spacing w:before=\"$before\" w:after=\"$after\"/></w:pPr>" +
                "<w:r><w:rPr>${if (b) "<w:b/>" else ""}${if (i) "<w:i/>" else ""}" +
                "<w:sz w:val=\"$sz\"/><w:szCs w:val=\"$sz\"/>" +
                "${if (caps) "<w:caps/>" else ""}${if (grey) "<w:color w:val=\"595959\"/>" else ""}</w:rPr>" +
                "<w:t xml:space=\"preserve\">${xe(text)}</w:t></w:r></w:p>"
        val body = StringBuilder(para(r.name, sz = 34, b = true, after = 40))
        if (r.contact.isNotEmpty()) body.append(para(r.contact, sz = 18, grey = true))
        if (r.headline.isNotEmpty()) body.append(para(r.headline, sz = 21, i = true, after = 180))
        // An empty section reads as a bug in the document someone is about to send (the web's rule).
        r.sections.filter { it.items.isNotEmpty() }.forEach { sec ->
            body.append(para(sec.heading, sz = 19, b = true, caps = true, before = 220, after = 80))
            sec.items.forEach { it ->
                if (it.title.isNotEmpty()) body.append(para(it.title, sz = 21, b = true, after = if (it.meta.isNotEmpty()) 20 else 60))
                if (it.meta.isNotEmpty()) body.append(para(it.meta, sz = 18, grey = true))
                it.bullets.forEach { b -> body.append(para("•  $b", ind = true, after = 40)) }
            }
        }
        return pack(body.toString())
    }

    private fun pack(body: String): ByteArray {
        val parts = listOf(
            "[Content_Types].xml" to
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
                "</Types>",
            "_rels/.rels" to
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>" +
                "</Relationships>",
            "word/document.xml" to
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" + body +
                "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/>" +
                "<w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\"/></w:sectPr>" +
                "</w:body></w:document>",
        )
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z -> parts.forEach { (n, x) -> z.putNextEntry(ZipEntry(n)); z.write(x.toByteArray()); z.closeEntry() } }
        return out.toByteArray()
    }
}

const val DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/** The web's slug: company-title, lowercased, 60 characters. Files are named for the job they are for. */
fun jobSlug(p: Posting) = "${p.company}-${p.title}".lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').take(60)

