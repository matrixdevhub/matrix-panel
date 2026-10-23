import { useEffect, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpRight, Boxes, ChevronDown, CircleHelp, Command,
  Cpu, Database, Gauge, HardDrive, LayoutDashboard, LifeBuoy, LogOut, Menu, Network, Plus,
  RefreshCw, Search, Server, Settings2, ShieldCheck, TerminalSquare, Users, X, Zap
} from "lucide-react";

const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
type ServerItem = { id: number; uuid: string; identifier: string; name: string; description: string; node: number; ownerId: number; status: string; limits: { memory: number; disk: number; cpu: number } };
type Overview = { servers: number; nodes: number; locations: number; connection: string; source: string };
type Health = { status: string; pterodactyl: string; database: string };

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: "include" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
  return payload as T;
}

const nav = [
  { title: "WORKSPACE", items: [{ label: "Overview", icon: LayoutDashboard }, { label: "Servers", icon: Server }] },
  { title: "ADMINISTRATION", items: [
    { label: "Users", icon: Users }, { label: "Nodes", icon: Boxes }, { label: "Locations", icon: Network },
    { label: "Nests", icon: Boxes }, { label: "Mounts", icon: HardDrive }, { label: "Plans", icon: Zap },
    { label: "Redeem Codes", icon: ArrowDownToLine }, { label: "Balance", icon: Gauge },
    { label: "Settings", icon: Settings2 }, { label: "Activity", icon: Activity }
  ] }
];
const resourceEndpoints: Record<string, string> = {
  Users: "/api/admin/users?limit=100", Nodes: "/api/admin/pterodactyl/nodes?per_page=100",
  Locations: "/api/admin/pterodactyl/locations?per_page=100", Nests: "/api/admin/pterodactyl/nests?per_page=100",
  Mounts: "/api/admin/pterodactyl/mounts?per_page=100", Plans: "/api/admin/plans",
  "Redeem Codes": "/api/admin/redeem-codes?limit=100", Balance: "/api/admin/balances",
  Settings: "/api/admin/settings", Activity: "/api/admin/audit-logs?limit=100"
};

export default function App() {
  const [active, setActive] = useState("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<{ username: string; role: string } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [resourceRecords, setResourceRecords] = useState<Record<string, unknown>[]>([]);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceRefresh, setResourceRefresh] = useState(0);
  const [resourceError, setResourceError] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try {
      const h = await api<Health>("/api/health");
      setHealth(h);
      if (h.pterodactyl === "configured") {
        const [o, s] = await Promise.all([api<Overview>("/api/overview"), api<{data: ServerItem[]}>("/api/servers")]);
        setOverview(o); setServers(s.data);
      } else {
        setOverview(null); setServers([]);
      }
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "API unavailable");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void api<{ user: { username: string; role: string } }>("/api/auth/me")
      .then(result => { setAuthUser(result.user); void refresh(); })
      .catch(() => { setAuthUser(null); })
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    if (active === "Overview" || active === "Servers" || !authUser || authUser.role !== "admin") { setResourceRecords([]); setResourceError(""); return; }
    const endpoint = resourceEndpoints[active]; if (!endpoint) return;
    let cancelled = false; setResourceLoading(true); setResourceError("");
    void api<{ data?: unknown }>(endpoint).then(payload => {
      if (cancelled) return;
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
      setResourceRecords(rows as Record<string, unknown>[]);
    }).catch(error => { if (!cancelled) { setResourceRecords([]); setResourceError(error instanceof Error ? error.message : "Unable to load this section"); } })
      .finally(() => { if (!cancelled) setResourceLoading(false); });
    return () => { cancelled = true; };
  }, [active, authUser, resourceRefresh]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoginBusy(true); setLoginError("");
    try {
      const response = await fetch(`${API}/api/auth/login`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: loginName, password: loginPassword }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || result.error || "Login failed");
      setAuthUser(result.user); await refresh();
    } catch (e) { setLoginError(e instanceof Error ? e.message : "Login failed"); }
    finally { setLoginBusy(false); }
  }

  const filtered = servers.filter(s => (s.name + " " + s.identifier).toLowerCase().includes(query.toLowerCase()));
  const isConnected = health?.pterodactyl === "configured" && overview?.connection === "connected";
  const activeServers = servers.filter(s => s.status === "running").length;
  const stats = [
    { label: "Total servers", value: overview ? String(overview.servers) : "—", detail: "From your panel", icon: Server },
    { label: "Online servers", value: overview ? String(activeServers) : "—", detail: "Live state when available", icon: Activity },
    { label: "Nodes", value: overview ? String(overview.nodes) : "—", detail: "Pterodactyl infrastructure", icon: Boxes },
    { label: "Locations", value: overview ? String(overview.locations) : "—", detail: "Configured locations", icon: Network }
  ];

  if (authChecking) return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Command size={21}/></div><h1>Matrix Panel</h1><p>Checking your secure session…</p></div></div>;
  if (!authUser) return <div className="auth-shell"><form className="auth-card" onSubmit={login}><div className="brand-mark"><Command size={21}/></div><div className="eyebrow"><span className="eyebrow-line"/> SECURE CONTROL CENTER</div><h1>Welcome back</h1><p>Sign in to access your Matrix Panel workspace.</p>{loginError && <div className="alert error"><ShieldCheck size={18}/><div><b>Sign in failed</b><p>{loginError}</p></div></div>}<label className="auth-label">Email or username<input autoComplete="username" required value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="admin" /></label><label className="auth-label">Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Your password" /></label><button className="button primary auth-submit" type="submit" disabled={loginBusy}>{loginBusy ? "Signing in…" : "Sign in"}</button><small className="auth-note">First-time setup is performed through the protected API setup endpoint by the server owner.</small></form></div>;

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><Command size={21}/></div><div><b>matrix<span>.</span></b><small>CONTROL CENTER</small></div><button className="icon-btn close-menu" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <button className="workspace"><div className="workspace-logo">M</div><div className="workspace-text"><b>Matrix Hosting</b><small>Personal workspace</small></div><ChevronDown size={15}/></button>
      <div className="nav-groups">{nav.map(group => ({ ...group, items: group.items.filter(item => group.title !== "ADMINISTRATION" || authUser?.role === "admin") })).filter(group => group.items.length > 0).map(group => <div className="nav-group" key={group.title}><div className="nav-label">{group.title}</div>{group.items.map(item => <button key={item.label} onClick={() => { setActive(item.label); setSidebarOpen(false); }} className={`nav-item ${active === item.label ? "selected" : ""}`}><item.icon size={17}/><span>{item.label}</span>{item.label === "Servers" && <span className="nav-count">{overview?.servers ?? "—"}</span>}</button>)}</div>)}</div>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Zap size={17}/></div><b>Built for your servers</b><p>One clear view of your infrastructure.</p><button onClick={() => setActive("Settings")}>Panel settings <ArrowUpRight size={14}/></button></div><button className="nav-item"><LifeBuoy size={17}/><span>Help & support</span><ArrowUpRight className="nav-trailing" size={14}/></button><div className="profile"><div className="avatar">M</div><div className="profile-info"><b>{authUser.username}</b><small>{authUser.role === "admin" ? "Panel administrator" : "Panel user"}</small></div><Settings2 size={17} className="muted"/><button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={async () => { await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" }); setAuthUser(null); setHealth(null); setOverview(null); setServers([]); }}><LogOut size={16}/></button></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="crumbs"><button className="icon-btn mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={19}/></button><span>Workspace</span><span className="crumb-slash">/</span><b>{active}</b></div><div className="top-actions"><div className="status-pill"><span className={`status-dot ${isConnected ? "good" : "bad"}`}/>{isConnected ? "Pterodactyl connected" : "Pterodactyl not connected"}</div><button className="icon-btn" aria-label="Help"><CircleHelp size={18}/></button><div className="avatar top-avatar">M</div></div></header>
      <div className="content">
        {active !== "Overview" && active !== "Servers" ? <section className="resource-view"><section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> ADMIN WORKSPACE</div><h1>{active}</h1><p className="subtitle">Live records from the Matrix database or connected Pterodactyl API.</p></div><button className="button secondary" onClick={() => setActive("Overview")}><LayoutDashboard size={15}/> Overview</button></section>{resourceError && <div className="alert error"><ShieldCheck size={18}/><div><b>Could not load {active}</b><p>{resourceError}</p></div></div>}<section className="panel-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><Database size={17}/></div><div><b>{active}</b><small>{resourceLoading ? "Loading live data…" : `${resourceRecords.length} records returned`}</small></div></div><button className="button secondary" onClick={() => setResourceRefresh(value => value + 1)} disabled={resourceLoading}><RefreshCw size={15} className={resourceLoading ? "spin" : ""}/> Refresh</button></div><div className="table-wrap"><table><thead><tr>{(resourceRecords.length ? Object.keys(resourceRecords[0]) : ["Data"]).map(key => <th key={key}>{key.replaceAll("_"," ").toUpperCase()}</th>)}</tr></thead><tbody>{resourceLoading ? <tr><td className="empty-row" colSpan={Math.max(1,Object.keys(resourceRecords[0] ?? {}).length)}>Loading…</td></tr> : resourceRecords.length ? resourceRecords.map((record,index) => <tr key={String(record.id ?? record.uuid ?? index)}>{Object.keys(resourceRecords[0]).map(key => <td key={key}>{record[key] === null || record[key] === undefined ? "—" : typeof record[key] === "object" ? JSON.stringify(record[key]) : String(record[key])}</td>)}</tr>) : <tr><td className="empty-row" colSpan={1}>{resourceError ? "Data could not be loaded." : "No records returned by the configured source."}</td></tr>}</tbody></table></div></section></section> : <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR INFRASTRUCTURE</div><h1>{active === "Overview" ? "Overview" : active}</h1><p className="subtitle">Monitor your game servers and manage your infrastructure.</p></div><div className="header-buttons"><button className="button secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""}/> Refresh</button><button className="button primary" onClick={() => { setActive("Servers"); }}><Plus size={16}/> View servers</button></div></section>

        {error && <div className="alert error"><ShieldCheck size={18}/><div><b>API connection issue</b><p>{error}</p></div><button className="icon-btn" onClick={() => void refresh()} aria-label="Retry"><RefreshCw size={15}/></button></div>}
        {health?.pterodactyl !== "configured" && !error && <div className="alert setup"><div className="setup-icon"><Zap size={19}/></div><div><b>Connect your Pterodactyl panel</b><p>Set the panel URL and Application API key in the backend <code>.env</code> file. The key is never sent to this browser.</p><a href="https://pterodactyl.io/panel/1.0/getting_started.html" target="_blank" rel="noreferrer">Pterodactyl setup guide <ArrowUpRight size={13}/></a></div></div>}

        <section className="section-heading"><div><h2>Infrastructure</h2><p>Live totals from your Pterodactyl installation.</p></div><span className="live-label"><span className="status-dot good"/>{isConnected ? "LIVE CONNECTION" : "AWAITING CONNECTION"}</span></section>
        <div className="stats-grid">{stats.map((stat, i) => <article className="stat-card" key={stat.label}><div className="stat-top"><div className={`stat-icon icon-${i}`}><stat.icon size={18}/></div><span className="stat-kicker">{["SERVERS","ACTIVITY","NODES","LOCATIONS"][i]}</span></div><div className="stat-value">{loading ? <span className="skeleton"/> : stat.value}</div><div className="stat-bottom"><span>{stat.label}</span><span className="stat-detail">{stat.detail}</span></div></article>)}</div>

        <section className="section-heading servers-heading"><div><h2>Server overview</h2><p>Servers retrieved from your connected panel.</p></div><button className="text-button" onClick={() => setActive("Servers")}>All servers <ArrowUpRight size={14}/></button></section>
        <section className="panel-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><TerminalSquare size={17}/></div><div><b>All servers</b><small>{overview ? `${overview.servers} servers in your panel` : "Connect your panel to load servers"}</small></div></div><label className="search-box"><Search size={15}/><input placeholder="Search servers..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label></div>
          <div className="table-wrap"><table><thead><tr><th>SERVER</th><th>STATUS</th><th>NODE</th><th>MEMORY LIMIT</th><th>CPU LIMIT</th><th/></tr></thead><tbody>
            {loading ? <tr><td colSpan={6} className="empty-row"><RefreshCw size={17} className="spin"/> Connecting to your panel…</td></tr> : filtered.length ? filtered.slice(0, 8).map(s => <tr key={s.uuid}><td><div className="server-cell"><div className="server-avatar"><Server size={16}/></div><div><b>{s.name}</b><small>{s.identifier}</small></div></div></td><td><span className={`server-status ${s.status === "running" ? "running" : s.status === "suspended" ? "suspended" : "stopped"}`}><span/>{s.status}</span></td><td><span className="node-cell"><Network size={13}/> Node {s.node}</span></td><td>{s.limits.memory ? `${(s.limits.memory / 1024).toFixed(1)} GB` : "—"}</td><td>{s.limits.cpu ? `${s.limits.cpu}%` : "Unlimited"}</td><td><button className="row-action" aria-label={`Open ${s.name}`} onClick={() => setActive("Servers")}><ArrowUpRight size={15}/></button></td></tr>) : <tr><td colSpan={6} className="empty-row"><Server size={20}/><b>{isConnected ? "No matching servers" : "No server data yet"}</b><span>{isConnected ? "Try another search term." : "Once connected, real servers will appear here. No sample servers are shown."}</span></td></tr>}
          </tbody></table></div><div className="table-footer"><span>Showing <b>{filtered.length}</b> of <b>{overview?.servers ?? 0}</b> servers</span><span className="updated">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "Not yet synced"}</span></div>
        </section>

        <section className="bottom-grid"><article className="info-card"><div className="info-card-head"><div className="mini-icon purple"><Gauge size={17}/></div><div><b>Connection health</b><small>Service status</small></div><span className={`health-chip ${isConnected ? "healthy" : "waiting"}`}>{isConnected ? "Connected" : "Pending"}</span></div><div className="health-row"><span>Matrix API</span><span><i className={health?.status === "ok" ? "tiny-dot good" : "tiny-dot bad"}/>{health?.status === "ok" ? "Operational" : "Unavailable"}</span></div><div className="health-row"><span>Pterodactyl API</span><span><i className={`tiny-dot ${isConnected ? "good" : "bad"}`}/>{isConnected ? "Connected" : "Not configured"}</span></div><div className="health-row"><span>Database</span><span><i className={`tiny-dot ${health?.database === "configured" ? "good" : "bad"}`}/>{health?.database === "configured" ? "Configured" : "Not configured"}</span></div></article>
          <article className="info-card quick-card"><div className="info-card-head"><div className="mini-icon blue"><HardDrive size={17}/></div><div><b>Quick access</b><small>Common destinations</small></div></div><button onClick={() => setActive("Servers")}><span className="quick-symbol"><Server size={16}/></span><span><b>Server management</b><small>Browse your server inventory</small></span><ArrowUpRight size={15}/></button><button onClick={() => setActive("Nodes")}><span className="quick-symbol"><Cpu size={16}/></span><span><b>Node infrastructure</b><small>View configured nodes</small></span><ArrowUpRight size={15}/></button></article></section>
        <footer><span><span className="footer-mark">M</span> Matrix Panel <span className="footer-version">v0.1.0</span></span><span>Built for infrastructure that matters <ArrowUpRight size={12}/></span></footer>
      </div>
    </main>
  </div>;
}
