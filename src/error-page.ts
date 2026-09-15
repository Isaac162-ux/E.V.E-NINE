export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>This page failed to load</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100vh;
        min-height: 100dvh;
      }
      body {
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #171717;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(100% - 32px, 28rem);
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.25;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      p {
        margin: 8px 0 0;
        color: #737373;
        font-size: 14px;
        line-height: 1.625;
      }
      .actions {
        margin-top: 24px;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
      }
      a {
        display: inline-flex;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        padding: 8px 16px;
        color: #171717;
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
      }
      a:hover { background: #f5f5f5; }
      a.primary {
        border-color: #171717;
        background: #171717;
        color: #fafafa;
      }
      a.primary:hover { background: #262626; }
    </style>
  </head>
  <body>
    <main>
      <h1>This page failed to load</h1>
      <p>An error stopped it from rendering.</p>
      <div class="actions">
        <a class="primary" href="">Try again</a>
        <a href="/">Go home</a>
      </div>
    </main>
  </body>
</html>`
}
