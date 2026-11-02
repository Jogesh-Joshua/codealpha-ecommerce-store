/**
 * src/views/notFoundPage.js
 *
 * In-code 404 HTML generator for unknown non-API routes.
 * Does not read from disk so it works reliably in serverless environments.
 */

/**
 * Render the 404 HTML page as a string.
 *
 * @param {object} [options]
 * @param {string} [options.requestId]
 * @returns {string}
 */
export function renderNotFoundPage({ requestId } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found — Deskline</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/pages.css">
</head>
<body class="page-not-found">
  <header class="site-header">
    <div class="container header-container">
      <a href="/" class="brand-logo" aria-label="Deskline Home">Deskline</a>
    </div>
  </header>
  <main class="container main-content" id="main">
    <div class="empty-state not-found-state">
      <h1 class="heading-1">Page Not Found</h1>
      <p class="body-text">The page you were looking for could not be found or may have moved.</p>
      <div class="action-row">
        <a href="/" class="button button-primary">Return to Home</a>
        <a href="/shop" class="button button-secondary">Explore Shop</a>
      </div>
      ${requestId ? `<p class="footnote" style="margin-top:2rem;color:var(--color-slate-muted,#6b7280);">Request ID: <code>${requestId}</code></p>` : ''}
    </div>
  </main>
  <footer class="site-footer">
    <div class="container footer-container">
      <p class="copyright">&copy; Deskline. Educational demonstration store.</p>
    </div>
  </footer>
</body>
</html>`;
}

