import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask
import org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.4.21"
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

// --- Inputs coming from sibling packages of the monorepo (both optional) ---------------------------
// TextMate grammar maintained with the VS Code extension; a minimal fallback is bundled when absent.
val owtGrammarFile: File =
    file(providers.gradleProperty("owtGrammar").getOrElse("../owt-vscode/syntaxes/owt.tmLanguage.json"))
// Self-contained language server bundle (`dist/index.js`), shipped as `<plugin>/server/index.js` when present.
val owtServerDistDir: File =
    file(providers.gradleProperty("owtServerDist").getOrElse("../owt-language-server/dist"))

/** IntelliJ IDEA is published as `IU` up to 2025.2 and as the unified `idea` distribution since 2025.3. */
fun ideaTypeFor(version: String): IntelliJPlatformType {
    val (year, release) = version.split('.').map { it.toIntOrNull() ?: 0 } + listOf(0, 0)
    return if (year > 2025 || (year == 2025 && release >= 3)) IntelliJPlatformType.IntellijIdea
    else IntelliJPlatformType.IntellijIdeaUltimate
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
        // Rely on real JVM default methods of platform interfaces; no compatibility bridges, which would
        // reference interface methods that only exist in newer platforms (e.g. the 2026.1.4 LSP API rename).
        jvmDefault.set(JvmDefaultMode.NO_COMPATIBILITY)
        // 2025.2, the oldest supported platform, bundles Kotlin stdlib 2.1.20: do not use newer stdlib APIs.
        apiVersion.set(KotlinVersion.KOTLIN_2_1)
        // ... and silence the "API version 2.1 is deprecated" warning that this deliberately triggers.
        freeCompilerArgs.add("-Xsuppress-version-warnings")
    }
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.opentest4j:opentest4j:1.3.0")

    intellijPlatform {
        // IntelliJ IDEA is a single (unified) distribution since 2025.3.
        intellijIdea(providers.gradleProperty("platformVersion"))
        // Optional plugin dependencies (see the <depends optional="true"> entries in plugin.xml).
        bundledPlugin("org.jetbrains.plugins.textmate")
        bundledPlugin("JavaScript")
        pluginVerifier()
        zipSigner()
        testFramework(TestFrameworkType.Platform)
    }
}

intellijPlatform {
    // Kotlin-only sources, no GUI forms: bytecode instrumentation is not needed.
    instrumentCode = false
    buildSearchableOptions = providers.gradleProperty("buildSearchableOptions").map(String::toBoolean).orElse(true)

    pluginConfiguration {
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = provider { null }
        }
        changeNotes = """
            <ul>
              <li>OWT file type, TextMate based highlighting, comments and brace matching.</li>
              <li>OWT language server integration through the IntelliJ Platform LSP API.</li>
              <li>Settings page (Languages &amp; Frameworks | OWT) and Tools | Restart OWT Language Server.</li>
            </ul>
        """.trimIndent()
    }

    pluginVerification {
        ides {
            // The IDE the plugin is compiled against (platformVersion), the oldest supported one,
            // plus optional extra IntelliJ IDEA versions: -PverifyIdeVersions=2025.3.6,2026.1.5
            current()
            val oldest = providers.gradleProperty("oldestPlatformVersion").get()
            val extra = providers.gradleProperty("verifyIdeVersions").orNull
                ?.split(',')?.map(String::trim)?.filter(String::isNotEmpty).orEmpty()
            (listOf(oldest) + extra).distinct().forEach { create(ideaTypeFor(it), it) }
        }
    }
}

// `./gradlew testOldestPlatform` runs the same tests inside the oldest supported IDE (see gradle.properties).
intellijPlatformTesting {
    testIde {
        register("testOldestPlatform") {
            type = ideaTypeFor(providers.gradleProperty("oldestPlatformVersion").get())
            version = providers.gradleProperty("oldestPlatformVersion")
            testFramework(TestFrameworkType.Platform)
            task {
                val testOutput = sourceSets.test.get().output
                testClassesDirs = testOutput.classesDirs
                classpath += testOutput
            }
        }
    }
}

val prepareTextMateBundle = tasks.register<Sync>("prepareTextMateBundle") {
    group = "build"
    description = "Assembles the OWT TextMate bundle (package.json, language-configuration.json, grammar)."

    val grammar = owtGrammarFile
    from("src/textmate/bundle")
    into("syntaxes") {
        // Prefer the grammar of packages/owt-vscode; fall back to the minimal one bundled here.
        from(grammar)
        from("src/textmate/fallback") {
            exclude { grammar.isFile }
        }
    }
    into(layout.buildDirectory.dir("textmate/owt"))

    doLast {
        val source = if (grammar.isFile) grammar.path else "src/textmate/fallback (no $grammar)"
        logger.lifecycle("OWT TextMate grammar: $source")
    }
}

// Ship the TextMate bundle and the language server next to the plugin jars, in every sandbox
// (buildPlugin / runIde / tests): <plugin>/textmate/owt and <plugin>/server.
tasks.withType<PrepareSandboxTask>().configureEach {
    val serverDist = owtServerDistDir

    from(prepareTextMateBundle) {
        into(pluginName.map { "$it/textmate/owt" })
    }
    from(serverDist) {
        exclude("**/*.map", "package.json")
        into(pluginName.map { "$it/server" })
    }
    // `{"type": "commonjs"}`: Node would otherwise pick the module type from the nearest parent package.json.
    from("src/server/package.json") {
        into(pluginName.map { "$it/server" })
    }

    doLast {
        if (serverDist.resolve("index.js").isFile) {
            logger.lifecycle("OWT language server bundled from $serverDist")
        } else {
            logger.warn(
                "OWT language server not bundled: $serverDist/index.js does not exist. " +
                    "Build packages/owt-language-server first, or rely on node_modules/@owt/language-server / the settings path."
            )
        }
    }
}

tasks {
    wrapper {
        gradleVersion = "9.8.1"
        distributionType = Wrapper.DistributionType.BIN
        distributionSha256Sum = "dce76f55f8e251a3a1f130eb120f30b3d271de2b76c9b0729d316b5a1b6dc01f"
    }
}
