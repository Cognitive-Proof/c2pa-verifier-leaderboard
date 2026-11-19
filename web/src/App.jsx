import { useEffect, useMemo, useRef, useState } from "react";

const AI_STATUSES = ["AI", "Edited with AI", "Unknown", "No AI"];
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|heic|heif|tiff?|svg)$/i;
const aiClass = (s) => "pill ai-" + s.toLowerCase().replace(/\s+/g, "-");

// "conformant/2.5" or "experimental/2.5": the group a test file is shown under.
// Conformant groups come first, then experimental, each by spec version.
const groupOf = (f) => `${f.category}/${f.version}`;
const groupLabel = (g) => {
  const [category, version] = g.split("/");
  return category === "experimental" ? `Experimental (non-conformant) · C2PA ${version}` : `Conformant · C2PA ${version}`;
};
const compareGroups = (a, b) => {
  const [ca, va] = a.split("/");
  const [cb, vb] = b.split("/");
  if (ca !== cb) return ca === "conformant" ? -1 : 1;
  const [x, y] = [va, vb].map((v) => v.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1];
};

// The most common value, used to spot the systems that disagree with the rest.
const majority = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return top && [...counts.values()].filter((n) => n === top[1]).length === 1 ? top[0] : undefined;
};

// Everything the viewer needs about one test file: each company's result and where they disagree.
function compare(file, results, companies) {
  const byCompany = Object.fromEntries(results.map((r) => [r.company, r]));
  const valid = new Set(results.map((r) => r.c2paValid));
  const ai = new Set(results.map((r) => r.aiStatus));
  return {
    file,
    group: groupOf(file),
    byCompany,
    reported: results.length,
    missing: companies.length - results.length,
    validDiffers: valid.size > 1,
    aiDiffers: ai.size > 1,
    usualValid: majority(results.map((r) => r.c2paValid)),
    usualAi: majority(results.map((r) => r.aiStatus)),
  };
}

const readHash = () => decodeURIComponent(location.hash.replace(/^#\/?file\//, "")) || null;

export default function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [group, setGroup] = useState("all");
  const [show, setShow] = useState("all");
  const [ai, setAi] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(() => new Set([readHash()].filter(Boolean)));
  const [collapsed, setCollapsed] = useState(() => new Set());

  useEffect(() => {
    fetch("./combined.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setLoadError(e.message));
  }, []);

  const companies = data?.companies ?? [];

  const rows = useMemo(() => {
    if (!data) return [];
    const byFile = new Map();
    for (const r of data.results) {
      if (!byFile.has(r.file)) byFile.set(r.file, []);
      byFile.get(r.file).push(r);
    }
    return data.testFiles.map((f) => compare(f, byFile.get(f.path) ?? [], data.companies));
  }, [data]);

  const groups = useMemo(() => [...new Set(rows.map((r) => r.group))].sort(compareGroups), [rows]);
  const totals = useMemo(
    () => ({
      differ: rows.filter((r) => r.validDiffers || r.aiDiffers).length,
      incomplete: rows.filter((r) => r.missing > 0).length,
    }),
    [rows],
  );

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map();
    for (const row of rows) {
      if (group !== "all" && row.group !== group) continue;
      if (q && !row.file.path.toLowerCase().includes(q)) continue;
      if (show === "differ" && !(row.validDiffers || row.aiDiffers)) continue;
      if (show === "validity" && !row.validDiffers) continue;
      if (show === "ai" && !row.aiDiffers) continue;
      if (show === "missing" && row.missing === 0) continue;
      if (ai !== "all" && !Object.values(row.byCompany).some((r) => r.aiStatus === ai)) continue;
      if (!out.has(row.group)) out.set(row.group, []);
      out.get(row.group).push(row);
    }
    return [...out.entries()].sort(([a], [b]) => compareGroups(a, b));
  }, [rows, group, show, ai, query]);
  const shown = sections.reduce((n, [, list]) => n + list.length, 0);

  // A file linked from #file/<path> opens and scrolls into view once the data is loaded.
  const linked = useRef(readHash());
  useEffect(() => {
    if (!data || !linked.current) return;
    document.getElementById("f:" + linked.current)?.scrollIntoView({ block: "center" });
    linked.current = null;
  }, [data]);

  const toggle = (path) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    history.replaceState(null, "", open.has(path) ? location.pathname : `#file/${encodeURIComponent(path)}`);
  };
  const toggleGroup = (g) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  if (loadError) return <main className="page"><p className="empty">Could not load combined.json: {loadError}</p></main>;
  if (!data) return <main className="page"><p className="empty">Loading…</p></main>;

  return (
    <main className="page">
      <header>
        <h1>C2PA Plugfest Results</h1>
        <p className="sub">
          {data.testFiles.length} test files · {companies.length} systems · {data.results.length} results ·
          updated {new Date(data.generatedAt).toLocaleString()} · <a href="./combined.json">combined.json</a>
        </p>
      </header>

      <div className="stats">
        <Stat label="Test files" value={data.testFiles.length} />
        <Stat label="Systems disagree" value={totals.differ} onClick={() => setShow("differ")} />
        <Stat label="Missing a result" value={totals.incomplete} onClick={() => setShow("missing")} />
      </div>

      <Coverage data={data} />

      <div className="filters">
        <label>
          Test files
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">All versions</option>
            {groups.map((g) => <option key={g} value={g}>{groupLabel(g)}</option>)}
          </select>
        </label>
        <label>
          Show
          <select value={show} onChange={(e) => setShow(e.target.value)}>
            <option value="all">All files</option>
            <option value="differ">Systems disagree</option>
            <option value="validity">Disagree on validity</option>
            <option value="ai">Disagree on AI label</option>
            <option value="missing">Missing a result</option>
          </select>
        </label>
        <label>
          Any system said
          <select value={ai} onChange={(e) => setAi(e.target.value)}>
            <option value="all">Any AI label</option>
            {AI_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="grow">
          Search file name
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. jpeg" />
        </label>
        <div className="count">{shown} of {rows.length} files</div>
      </div>

      {sections.length === 0 && <p className="empty">Nothing matches these filters.</p>}

      {sections.map(([g, list]) => {
        const differ = list.filter((r) => r.validDiffers || r.aiDiffers).length;
        const isCollapsed = collapsed.has(g);
        return (
          <section key={g}>
            <h2>
              <button className="group-toggle" onClick={() => toggleGroup(g)} aria-expanded={!isCollapsed}>
                <span className="caret">{isCollapsed ? "▸" : "▾"}</span> {groupLabel(g)}
              </button>
              <span className="group-meta">{list.length} files{differ ? ` · ${differ} disagree` : ""}</span>
            </h2>
            {!isCollapsed && (
              <div className="table-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th className="file-col">Test file</th>
                      <th className="agree-col">Agreement</th>
                      {companies.map((c) => <th key={c.id} className="sys-col">{c.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row) => (
                      <FileRows
                        key={row.file.path}
                        row={row}
                        companies={companies}
                        isOpen={open.has(row.file.path)}
                        onToggle={() => toggle(row.file.path)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

function FileRows({ row, companies, isOpen, onToggle }) {
  const { file } = row;
  return (
    <>
      <tr id={"f:" + file.path} className={"file-row" + (isOpen ? " open" : "")} onClick={onToggle}>
        <td className="file-col">
          <span className="caret">{isOpen ? "▾" : "▸"}</span>
          <span className="file-name" title={file.path}>{file.name}</span>
        </td>
        <td className="agree-col"><Agreement row={row} /></td>
        {companies.map((c) => {
          const r = row.byCompany[c.id];
          if (!r) return <td key={c.id} className="sys-col muted">—</td>;
          const odd = (row.validDiffers && r.c2paValid !== row.usualValid) || (row.aiDiffers && r.aiStatus !== row.usualAi);
          return (
            <td key={c.id} className={"sys-col" + (odd ? " odd" : "")} title={r.userMessage}>
              <span className={r.c2paValid ? "mark ok" : "mark bad"} aria-label={r.c2paValid ? "Valid" : "Invalid"}>
                {r.c2paValid ? "✓" : "✗"}
              </span>
              <span className={aiClass(r.aiStatus)}>{r.aiStatus}</span>
            </td>
          );
        })}
      </tr>
      {isOpen && (
        <tr className="detail-row">
          <td colSpan={companies.length + 2}>
            <Detail row={row} companies={companies} />
          </td>
        </tr>
      )}
    </>
  );
}

function Agreement({ row }) {
  if (row.reported === 0) return <span className="muted">No results</span>;
  const parts = [];
  if (row.validDiffers) parts.push("validity");
  if (row.aiDiffers) parts.push("AI label");
  return (
    <span className="agree">
      {parts.length ? <span className="pill warn">Differ: {parts.join(", ")}</span> : <span className="pill same">Agree</span>}
      {row.missing > 0 && <span className="muted small">{row.missing} missing</span>}
    </span>
  );
}

// Side by side: what every system shows a user for this one file.
function Detail({ row, companies }) {
  const { file } = row;
  const [previewOk, setPreviewOk] = useState(true);
  const urls = fileUrls(file.path);
  return (
    <div className="detail">
      <div className="detail-file">
        {IMAGE_EXT.test(file.path) && previewOk && (
          <img className="preview" src={urls.raw} alt="" loading="lazy" onError={() => setPreviewOk(false)} />
        )}
        <div className="detail-path">{file.path}</div>
        <div className="detail-links">
          <a href={urls.raw} download>Download</a>
          {urls.blob && <a href={urls.blob}>View on GitHub</a>}
          <a href={`#file/${encodeURIComponent(file.path)}`}>Link to this file</a>
        </div>
      </div>
      <div className="cards">
        {companies.map((c) => {
          const r = row.byCompany[c.id];
          if (!r) {
            return (
              <div key={c.id} className="card missing">
                <div className="card-name">{c.name}</div>
                <div className="muted">No result for this file</div>
              </div>
            );
          }
          const odd = (row.validDiffers && r.c2paValid !== row.usualValid) || (row.aiDiffers && r.aiStatus !== row.usualAi);
          return (
            <div key={c.id} className={"card" + (odd ? " odd" : "")}>
              <div className="card-head">
                <span className="card-name">{c.name}</span>
                <span className={r.c2paValid ? "pill ok" : "pill bad"}>{r.c2paValid ? "Valid" : "Invalid"}</span>
                <span className={aiClass(r.aiStatus)}>{r.aiStatus}</span>
              </div>
              <div className="field-label">Shown to the user</div>
              <div className="user-message">{r.userMessage || <span className="muted">—</span>}</div>
              {r.error && (
                <>
                  <div className="field-label">Error</div>
                  <div className="error">{r.error}</div>
                </>
              )}
              <div className="field-label">Signals</div>
              {r.signals.length
                ? <div className="chips">{r.signals.map((s) => <code key={s}>{s}</code>)}</div>
                : <div className="muted">—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="stat" onClick={onClick}>
      <div className="stat-num">{value}</div>
      <div className="stat-label">{label}</div>
    </Tag>
  );
}

// Per system: how many test files it has results for, and how many it decoded as valid.
function Coverage({ data }) {
  if (!data.companies.length) return null;
  const total = data.testFiles.length || 1;
  return (
    <div className="coverage">
      {data.companies.map((c) => {
        const mine = data.results.filter((r) => r.company === c.id);
        const valid = mine.filter((r) => r.c2paValid).length;
        return (
          <div key={c.id} className="cov-row">
            <span className="cov-name">{c.name}</span>
            <div className="bar" title={`${valid} valid, ${mine.length - valid} invalid, ${data.testFiles.length - mine.length} missing`}>
              <div className="bar-ok" style={{ width: `${(valid / total) * 100}%` }} />
              <div className="bar-bad" style={{ width: `${((mine.length - valid) / total) * 100}%` }} />
            </div>
            <span className="cov-num">{mine.length}/{data.testFiles.length}</span>
            <span className="cov-date muted">{c.date}</span>
          </div>
        );
      })}
    </div>
  );
}

// On GitHub Pages, files come from the repository; in development, Vite serves them from testfiles/.
function fileUrls(path) {
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const repo = location.pathname.split("/").filter(Boolean)[0];
  const enc = path.split("/").map(encodeURIComponent).join("/");
  if (m && repo) {
    return {
      raw: `https://raw.githubusercontent.com/${m[1]}/${repo}/main/testfiles/${enc}`,
      blob: `https://github.com/${m[1]}/${repo}/blob/main/testfiles/${enc}`,
    };
  }
  return { raw: `./testfiles/${enc}`, blob: null };
}
