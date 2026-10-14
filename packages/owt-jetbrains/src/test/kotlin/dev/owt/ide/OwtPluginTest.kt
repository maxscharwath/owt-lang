package dev.owt.ide

import com.intellij.openapi.actionSystem.IdeActions
import com.intellij.openapi.application.AccessToken
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.testFramework.LoggedErrorProcessor
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import dev.owt.ide.lang.OwtFileType
import dev.owt.ide.lang.OwtLanguage
import dev.owt.ide.lsp.OwtLspServerDescriptor
import dev.owt.ide.server.OwtPathSource
import dev.owt.ide.server.OwtPluginPaths
import dev.owt.ide.server.OwtResolvedPath
import dev.owt.ide.server.OwtServerCommand
import dev.owt.ide.server.OwtServerLocator
import dev.owt.ide.settings.OwtSettings
import java.nio.file.Files
import java.nio.file.Path

class OwtPluginTest : BasePlatformTestCase() {

    private var errorFilter: AccessToken? = null

    private var lspWasEnabled = true

    override fun setUp() {
        errorFilter = LoggedErrorProcessor.executeWith(IgnoreUltimateStartupNoise)
        super.setUp()
        // These tests cover the editor integration only; do not spawn the (bundled) language server.
        lspWasEnabled = OwtSettings.getInstance().lspEnabled
        OwtSettings.getInstance().lspEnabled = false
    }

    override fun tearDown() {
        try {
            OwtSettings.getInstance().lspEnabled = lspWasEnabled
            super.tearDown()
        } finally {
            errorFilter?.finish()
        }
    }


    private val sample = """
        import { Button } from './Button.owt'

        export component Counter(props: { label: string }) {
          var count = 0
          val doubled = count * 2

          <button onClick={() => count++}>{props.label}: {count} ({doubled})</button>
          if (count > 10) { <p>Big</p> } else { <p>Small</p> }
        }
    """.trimIndent()

    fun testFileTypeAndLanguage() {
        val file = myFixture.configureByText("Counter.owt", sample)
        assertEquals(OwtFileType, file.virtualFile.fileType)
        assertEquals(OwtLanguage, file.language)
        assertEquals(sample, file.text)
    }

    fun testLineComment() {
        myFixture.configureByText("Counter.owt", "<caret>var count = 0\n")
        myFixture.performEditorAction(IdeActions.ACTION_COMMENT_LINE)
        assertTrue(myFixture.editor.document.text, myFixture.editor.document.text.startsWith("//"))
    }

    fun testBlockComment() {
        myFixture.configureByText("Counter.owt", "<selection>var count = 0</selection>\n")
        myFixture.performEditorAction(IdeActions.ACTION_COMMENT_BLOCK)
        val text = myFixture.editor.document.text
        assertTrue(text, text.startsWith("/*") && text.contains("*/"))
    }

    fun testTextMateBundleIsShippedWithThePlugin() {
        val bundle = OwtPluginPaths.textMateBundle()
        assertNotNull("TextMate bundle missing from the plugin directory ${OwtPluginPaths.pluginDirectory()}", bundle)
        assertTrue(Files.isRegularFile(bundle!!.resolve("syntaxes").resolve("owt.tmLanguage.json")))
        assertTrue(Files.isRegularFile(bundle.resolve("language-configuration.json")))
    }

    fun testHighlightingComesFromTheTextMateGrammar() {
        myFixture.configureByText("Counter.owt", sample)
        val highlighter = (myFixture.editor as EditorEx).highlighter
        val offset = sample.indexOf("var count")
        val iterator = highlighter.createIterator(offset)
        val tokenType = iterator.tokenType
        assertEquals("org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateElementType", tokenType.javaClass.name)
        assertTrue("unexpected scope for `var`: $tokenType", tokenType.toString().contains("storage"))
    }

    fun testServerResolutionFromSettings() {
        val dir = Files.createTempDirectory("owt-ls")
        val node = Files.createFile(dir.resolve("node"))
        val script = Files.createDirectories(dir.resolve("dist")).resolve("index.js").also { Files.writeString(it, "") }
        val settings = OwtSettings.getInstance()
        val previous = settings.state.let { Triple(it.nodePath, it.serverPath, it.serverArgs) }
        try {
            settings.nodePath = node.toString()
            settings.serverPath = dir.toString() // package folder: dist/index.js is found inside
            settings.serverArgs = "--log-level debug \"--name=a b\""

            val resolution = OwtServerLocator.resolve(project, settings)
            assertInstanceOf(resolution, dev.owt.ide.server.OwtServerResolution.Ready::class.java)
            val command = (resolution as dev.owt.ide.server.OwtServerResolution.Ready).command
            assertEquals(OwtPathSource.SETTINGS, command.node.source)
            assertEquals(script.toAbsolutePath().normalize(), command.script.path)
            assertEquals(
                listOf(node.toString(), script.toString(), "--stdio", "--log-level", "debug", "--name=a b"),
                command.commandLine,
            )
        } finally {
            settings.nodePath = previous.first
            settings.serverPath = previous.second
            settings.serverArgs = previous.third
        }
    }

    fun testBrokenSettingsAreReported() {
        val settings = OwtSettings.getInstance()
        val previous = settings.nodePath
        try {
            settings.nodePath = "/definitely/not/here/node"
            val resolution = OwtServerLocator.resolve(project, settings)
            assertInstanceOf(resolution, dev.owt.ide.server.OwtServerResolution.Failed::class.java)
        } finally {
            settings.nodePath = previous
        }
    }

    fun testLspDescriptor() {
        val command = OwtServerCommand(
            node = OwtResolvedPath(Path.of("/usr/bin/node"), OwtPathSource.PATH),
            script = OwtResolvedPath(Path.of("/srv/owt/dist/index.js"), OwtPathSource.BUNDLED),
            extraArgs = emptyList(),
            tsdk = Path.of("/srv/app/node_modules/typescript/lib"),
            workingDirectory = null,
        )
        val descriptor = OwtLspServerDescriptor(project, command)
        assertEquals("/usr/bin/node /srv/owt/dist/index.js --stdio", descriptor.createCommandLine().commandLineString)
        assertEquals(
            mapOf("typescript" to mapOf("tsdk" to "/srv/app/node_modules/typescript/lib")),
            descriptor.createInitializationOptions(),
        )
        val file = myFixture.configureByText("Counter.owt", sample).virtualFile
        assertTrue(descriptor.isSupportedFile(file))
        assertEquals("owt", descriptor.getLanguageId(file))
        assertFalse(descriptor.isSupportedFile(myFixture.configureByText("notes.txt", "x").virtualFile))

        val noTsdk = command.copy(tsdk = null)
        assertEquals(emptyMap<String, Any>(), OwtLspServerDescriptor(project, noTsdk).createInitializationOptions())
    }
}
