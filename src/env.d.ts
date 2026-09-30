/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client commit compiled into the app by the Docker build (see the server's deploy/qnap/build-image.sh). */
  readonly VITE_BUILD_COMMIT?: string;
  /** Build time (UTC, ISO 8601) compiled into the app. */
  readonly VITE_BUILD_TIME?: string;
}
