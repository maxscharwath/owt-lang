package dev.owt.ide.lang

import com.intellij.extapi.psi.ASTWrapperPsiElement
import com.intellij.extapi.psi.PsiFileBase
import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.lexer.LexerBase
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet

/**
 * Deliberately trivial PSI: the whole file is a single [OwtTokenTypes.CONTENT] leaf.
 *
 * OWT editing features (diagnostics, completion, navigation, symbols, formatting, …) come from the
 * language server; highlighting comes from the TextMate grammar. This PSI only gives the file the OWT
 * language so that language-scoped extensions (commenter, LSP integration) apply to it.
 */
class OwtParserDefinition : ParserDefinition {
    override fun createLexer(project: Project?): Lexer = OwtWholeFileLexer()

    override fun createParser(project: Project?): PsiParser = PsiParser { root, builder ->
        val marker = builder.mark()
        while (!builder.eof()) builder.advanceLexer()
        marker.done(root)
        builder.treeBuilt
    }

    override fun getFileNodeType(): IFileElementType = OwtTokenTypes.FILE

    override fun getCommentTokens(): TokenSet = TokenSet.EMPTY

    override fun getStringLiteralElements(): TokenSet = TokenSet.EMPTY

    override fun createElement(node: ASTNode): PsiElement = ASTWrapperPsiElement(node)

    override fun createFile(viewProvider: FileViewProvider): PsiFile = OwtFile(viewProvider)
}

object OwtTokenTypes {
    @JvmField
    val FILE: IFileElementType = IFileElementType("OWT_FILE", OwtLanguage)

    @JvmField
    val CONTENT: IElementType = IElementType("OWT_CONTENT", OwtLanguage)
}

class OwtFile(viewProvider: FileViewProvider) : PsiFileBase(viewProvider, OwtLanguage) {
    override fun getFileType(): FileType = OwtFileType

    override fun toString(): String = "OWT File"
}

/** Emits the whole buffer as one token. */
private class OwtWholeFileLexer : LexerBase() {
    private var buffer: CharSequence = ""
    private var start = 0
    private var end = 0
    private var tokenEnd = 0

    override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
        this.buffer = buffer
        this.start = startOffset
        this.end = endOffset
        this.tokenEnd = endOffset
    }

    override fun getState(): Int = 0

    override fun getTokenType(): IElementType? = if (start < end) OwtTokenTypes.CONTENT else null

    override fun getTokenStart(): Int = start

    override fun getTokenEnd(): Int = tokenEnd

    override fun advance() {
        start = end
    }

    override fun getBufferSequence(): CharSequence = buffer

    override fun getBufferEnd(): Int = end
}
