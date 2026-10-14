@file:Suppress("DEPRECATION")

package dev.owt.ide

import com.intellij.codeInsight.daemon.impl.HighlightInfo
import com.intellij.openapi.application.AccessToken
import com.intellij.platform.lsp.api.LspServerManager
import com.intellij.testFramework.LoggedErrorProcessor
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.builders.EmptyModuleFixtureBuilder
import com.intellij.testFramework.fixtures.CodeInsightFixtureTestCase
import dev.owt.ide.lsp.OwtLspServerSupportProvider
import dev.owt.ide.server.OwtServerLocator
import dev.owt.ide.settings.OwtSettings
import java.nio.file.Files
import java.nio.file.Path

/**
 * End-to-end check of the LSP wiring with a fake server (`src/test/testData/fake-owt-server.js`):
 * provider → Node.js / script / tsdk resolution → `node <script> --stdio <args>` → `initialize` with
 * `initializationOptions` → `didOpen` (languageId `owt`) → diagnostics shown in the editor.
 */
class OwtLspIntegrationTest : CodeInsightFixtureTestCase<EmptyModuleFixtureBuilder<*>>() {

    private var errorFilter: AccessToken? = null
    private val settings get() = OwtSettings.getInstance()
    private var savedState: OwtSettings.State? = null

    override fun setUp() {
        errorFilter = LoggedErrorProcessor.executeWith(IgnoreUltimateStartupNoise)
        super.setUp()
        savedState = OwtSettings.State().also {
            it.lspEnabled = settings.lspEnabled
            it.nodePath = settings.nodePath
            it.serverPath = settings.serverPath
            it.serverArgs = settings.serverArgs
        }
    }

    override fun tearDown() {
        try {
            LspServerManager.getInstance(project).stopServers(OwtLspServerSupportProvider::class.java)
            savedState?.let { settings.loadState(it) }
            super.tearDown()
        } finally {
            errorFilter?.finish()
        }
    }

    fun testServerIsStartedWithStdioAndInitializationOptions() {
        if (OwtServerLocator.findNode(project) == null) {
            System.err.println("Node.js not found, skipping ${javaClass.simpleName}")
            return
        }
        val fakeServer = Path.of("src/test/testData/fake-owt-server.js").toAbsolutePath()
        assertTrue("missing $fakeServer", Files.isRegularFile(fakeServer))

        settings.lspEnabled = true
        settings.serverPath = fakeServer.toString()
        settings.serverArgs = "--fake-flag"

        // A project-local TypeScript must be passed as initializationOptions.typescript.tsdk.
        myFixture.addFileToProject("node_modules/typescript/lib/typescript.js", "// fake typescript")
        val tsdk = Path.of(myFixture.tempDirPath, "node_modules", "typescript", "lib")

        myFixture.configureByText("App.owt", "var count = 0\n")
        LspServerManager.getInstance(project).startServersIfNeeded(OwtLspServerSupportProvider::class.java)

        val diagnostic = waitForFakeDiagnostic()
        assertNotNull("the fake OWT language server did not publish diagnostics", diagnostic)
        val message = diagnostic!!.description
        assertTrue(message, message.contains("languageId=owt"))
        assertTrue(message, message.contains("args=--stdio --fake-flag"))
        assertTrue(message, message.contains("\"tsdk\":\"${tsdk.toRealPath().toString().replace("\\", "\\\\")}\"") ||
            message.contains("\"tsdk\":\"$tsdk\""))
    }

    private fun waitForFakeDiagnostic(timeoutMs: Long = 60_000): HighlightInfo? {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            myFixture.doHighlighting().firstOrNull { it.description?.contains("fake-owt") == true }?.let { return it }
            Thread.sleep(250)
        }
        return null
    }
}
