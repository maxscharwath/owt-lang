package dev.owt.ide.lang

import com.intellij.lang.Language

object OwtLanguage : Language("OWT") {
    @Suppress("unused")
    private fun readResolve(): Any = OwtLanguage

    override fun getDisplayName(): String = "OWT"

    override fun isCaseSensitive(): Boolean = true
}
