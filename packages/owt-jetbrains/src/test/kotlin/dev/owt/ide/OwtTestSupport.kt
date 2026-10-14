package dev.owt.ide

import com.intellij.testFramework.LoggedErrorProcessor

/**
 * In tests on IntelliJ IDEA 2026.2 an (obfuscated) post-startup activity of the bundled "JetBrains Ultimate"
 * plugin cannot be instantiated and logs an error, which would fail every test. It is unrelated to this
 * plugin, so it is filtered out; any other logged error still fails the test.
 */
object IgnoreUltimateStartupNoise : LoggedErrorProcessor() {
    override fun processError(category: String, message: String, details: Array<String>, t: Throwable?): Set<Action> =
        if (message.startsWith("Cannot create extension") && message.contains("[Plugin: com.intellij.modules.ultimate]")) Action.NONE
        else super.processError(category, message, details, t)
}
