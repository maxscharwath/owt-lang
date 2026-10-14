rootProject.name = "owt-jetbrains"

plugins {
    // Lets Gradle provision the JDK declared by `kotlin { jvmToolchain(...) }` when it is missing locally.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
