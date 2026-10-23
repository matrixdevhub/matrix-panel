import { useEffect, useRef, useState } from "react";
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
  { title: "WORKSPACE", items: [{ label: "Overview", icon: LayoutDashboard }, { label: "Servers", icon: Server }, { label: "Profile", icon: Users }, { label: "My Plans", icon: Zap }, { label: "Redeem", icon: ArrowDownToLine }, { label: "My Balance", icon: Gauge }] },
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
  Settings: "/api/admin/settings", Activity: "/api/admin/audit-logs?limit=100",
  "My Plans": "/api/profile/plans", "My Balance": "/api/profile/balance"
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
  const [profileEmail, setProfileEmail] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileTheme, setProfileTheme] = useState("dark");
  const [profileSound, setProfileSound] = useState(true);
  const [profileAbout, setProfileAbout] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [adminActionBusy, setAdminActionBusy] = useState(false);
  const [adminActionMessage, setAdminActionMessage] = useState("");
  const [adminActionError, setAdminActionError] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newPlanKey, setNewPlanKey] = useState("");
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanMemory, setNewPlanMemory] = useState("2048");
  const [newPlanDisk, setNewPlanDisk] = useState("10240");
  const [newPlanCpu, setNewPlanCpu] = useState("100");
  const [newPlanPrice, setNewPlanPrice] = useState("0");
  const [redeemPlanKey, setRedeemPlanKey] = useState("");
  const [redeemDays, setRedeemDays] = useState("30");
  const [redeemUses, setRedeemUses] = useState("1");
  const [createdRedeemCode, setCreatedRedeemCode] = useState("");
  const [balanceUserId, setBalanceUserId] = useState("");
  const [balanceAmount, setBalanceAmount] = useState("100");
  const [balanceReason, setBalanceReason] = useState("Administrator adjustment");
  const [settingKey, setSettingKey] = useState("site.name");
  const [settingValue, setSettingValue] = useState("Matrix Panel");
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemMessage, setRedeemMessage] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [clientApiKey, setClientApiKey] = useState("");
  const [credentialConnected, setCredentialConnected] = useState(false);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialError, setCredentialError] = useState("");
  const [powerBusy, setPowerBusy] = useState("");
  const [selectedServer, setSelectedServer] = useState<ServerItem | null>(null);
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [consoleInput, setConsoleInput] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [pluginQuery, setPluginQuery] = useState("");
  const [pluginBusy, setPluginBusy] = useState(false);
  const [pluginFeedback, setPluginFeedback] = useState("");
  const [playerAction, setPlayerAction] = useState("whitelist add");
  const [playerFeedback, setPlayerFeedback] = useState("");
  const [motdValue, setMotdValue] = useState("");
  const [motdFileContent, setMotdFileContent] = useState<string | null>(null);
  const [motdBusy, setMotdBusy] = useState(false);
  const [motdFeedback, setMotdFeedback] = useState("");
  const [consoleStatus, setConsoleStatus] = useState("Connect a Client API key to open console.");
  const [serverTab, setServerTab] = useState("Console");
  const [serverResource, setServerResource] = useState<Record<string, unknown>[]>([]);
  const [fileEntries, setFileEntries] = useState<Record<string, unknown>[]>([]);
  const [fileDirectory, setFileDirectory] = useState("/");
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileDirty, setFileDirty] = useState(false);
  const [serverResourceLoading, setServerResourceLoading] = useState(false);
  const [serverResourceError, setServerResourceError] = useState("");
  const consoleSocket = useRef<WebSocket | null>(null);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const h = await api<Health>("/api/health");
      setHealth(h);
      if (authUser?.role === "admin" && h.pterodactyl === "configured") {
        const o = await api<Overview>("/api/overview");
        const s = credentialConnected ? await api<{data: ServerItem[]}>("/api/profile/servers") : await api<{data: ServerItem[]}>("/api/servers");
        setOverview(o); setServers(s.data);
      } else if (credentialConnected) {
        const s = await api<{data: ServerItem[]}>("/api/profile/servers");
        setOverview(null); setServers(s.data);
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
      .then(result => { setAuthUser(result.user); })
      .catch(() => { setAuthUser(null); })
      .finally(() => setAuthChecking(false));
  }, []);


  useEffect(() => { if (authUser) void refresh(); }, [authUser, credentialConnected]);

  useEffect(() => {
    if (!authUser) return;
    void api<{connected: boolean}>("/api/profile/pterodactyl-credential")
      .then(result => setCredentialConnected(result.connected))
      .catch(() => setCredentialConnected(false));
  }, [authUser]);

  useEffect(() => {
    if (!selectedServer || !["Console", "Minecraft"].includes(serverTab)) return;
    if (!credentialConnected) { setConsoleStatus("Connect your Pterodactyl Client API key to open this console."); return; }
    const apiOrigin = API || window.location.origin;
    const socketUrl = apiOrigin.replace(/^http/, "ws") + "/api/profile/servers/" + encodeURIComponent(selectedServer.identifier) + "/console";
    const socket = new WebSocket(socketUrl);
    consoleSocket.current = socket;
    setConsoleOutput([]); setConsoleStatus("Connecting to server console…");
    socket.onopen = () => setConsoleStatus("Console connected");
    socket.onmessage = event => setConsoleOutput(previous => [...previous, String(event.data)].slice(-400));
    socket.onerror = () => setConsoleStatus("Console connection error");
    socket.onclose = event => setConsoleStatus(event.reason || "Console disconnected");
    return () => { socket.close(); if (consoleSocket.current === socket) consoleSocket.current = null; };
  }, [selectedServer, credentialConnected, serverTab]);

  useEffect(() => {
    const userResource = active === "My Plans" || active === "My Balance";
    if (active === "Overview" || active === "Servers" || !authUser || (!userResource && authUser.role !== "admin")) { setResourceRecords([]); setResourceError(""); return; }
    const endpoint = resourceEndpoints[active]; if (!endpoint) return;
    let cancelled = false; setResourceLoading(true); setResourceError("");
    void api<{ data?: unknown }>(endpoint).then(payload => {
      if (cancelled) return;
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : active === "My Balance" ? [payload] : [];
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
      setAuthUser(result.user);
    } catch (e) { setLoginError(e instanceof Error ? e.message : "Login failed"); }
    finally { setLoginBusy(false); }
  }


  useEffect(() => {
    if (!selectedServer || !credentialConnected || serverTab === "Console") return;
    let cancelled = false;
    setServerResourceLoading(true); setServerResourceError("");
    const base = `${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}`;
    const load = async () => {
      if (serverTab === "Files" || serverTab === "Plugins") {
        const directory = serverTab === "Plugins" ? "/plugins" : fileDirectory;
        const response = await fetch(base + "/files?directory=" + encodeURIComponent(directory), { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || "Could not list files");
        if (!cancelled) setFileEntries(Array.isArray(payload.data) ? payload.data.map((entry: any) => entry.attributes ?? entry) : []);
      } else {
        const section = ({ Backups: "backups", Schedules: "schedules", Databases: "databases", Network: "network", Startup: "startup", Settings: "settings", Users: "users" } as Record<string,string>)[serverTab];
        if (!section) return;
        const response = await fetch(base + "/" + section, { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || "Could not load " + serverTab);
        const rows = Array.isArray(payload.data) ? payload.data.map((entry: any) => entry.attributes ?? entry) : payload.attributes ? [payload.attributes] : [payload];
        if (!cancelled) setServerResource(rows as Record<string,unknown>[]);
      }
    };
    void load().catch(error => { if (!cancelled) { setServerResourceError(error instanceof Error ? error.message : "Could not load resource"); setServerResource([]); setFileEntries([]); } }).finally(() => { if (!cancelled) setServerResourceLoading(false); });
    return () => { cancelled = true; };
  }, [selectedServer, credentialConnected, serverTab, fileDirectory]);


  useEffect(() => {
    if (active !== "Profile" || !authUser) return;
    setProfileError(""); setProfileMessage("");
    void Promise.all([api<{user:{email:string;username:string}}>("/api/profile"), api<{theme:string;notification_sound:boolean;about:string}>("/api/profile/preferences")])
      .then(([profile,prefs]) => { setProfileEmail(profile.user.email); setProfileUsername(profile.user.username); setProfileTheme(prefs.theme); setProfileSound(prefs.notification_sound); setProfileAbout(prefs.about); })
      .catch(error => setProfileError(error instanceof Error ? error.message : "Could not load profile"));
  }, [active, authUser]);

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
        {active !== "Overview" && active !== "Servers" ? <section className="resource-view"><section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> ADMIN WORKSPACE</div><h1>{active}</h1><p className="subtitle">Live records from the Matrix database or connected Pterodactyl API.</p></div><button className="button secondary" onClick={() => setActive("Overview")}><LayoutDashboard size={15}/> Overview</button></section>{resourceError && <div className="alert error"><ShieldCheck size={18}/><div><b>Could not load {active}</b><p>{resourceError}</p></div></div>}{active === "Redeem" ? <section className="panel-card redeem-form-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><ArrowDownToLine size={17}/></div><div><b>Activate a redeem code</b><small>Apply a code to your Matrix Panel account</small></div></div></div><form className="profile-form" onSubmit={async event=>{event.preventDefault();setRedeemBusy(true);setRedeemError("");setRedeemMessage("");try{const response=await fetch(`${API}/api/redeem`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:redeemInput})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"Code activation failed");setRedeemMessage("Plan activated: "+payload.plan.plan_key);setRedeemInput("");}catch(error){setRedeemError(error instanceof Error?error.message:"Code activation failed");}finally{setRedeemBusy(false);}}}><label className="auth-label">Redeem code<input value={redeemInput} onChange={event=>setRedeemInput(event.target.value)} minLength={8} maxLength={100} placeholder="Enter your code" required/></label><button className="button primary" disabled={redeemBusy || redeemInput.length<8}>{redeemBusy?"Activating…":"Activate code"}</button></form>{redeemError && <p className="credential-error">{redeemError}</p>}{redeemMessage && <p className="admin-action-message">{redeemMessage}</p>}</section> : active === "Profile" ? <div className="profile-settings-grid">
  <section className="panel-card profile-form-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><Users size={17}/></div><div><b>Profile details</b><small>Update your account information</small></div></div></div><form className="profile-form" onSubmit={async event => { event.preventDefault(); setProfileBusy(true); setProfileError(""); setProfileMessage(""); try { const response = await fetch(`${API}/api/profile`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:profileUsername,email:profileEmail})}); const payload=await response.json(); if(!response.ok) throw new Error(payload.message||payload.error||"Profile update failed"); setProfileMessage("Profile saved."); } catch(error) { setProfileError(error instanceof Error ? error.message : "Profile update failed"); } finally { setProfileBusy(false); } }}><label className="auth-label">Username<input value={profileUsername} onChange={event=>setProfileUsername(event.target.value)} minLength={3} maxLength={32} required/></label><label className="auth-label">Email<input type="email" value={profileEmail} onChange={event=>setProfileEmail(event.target.value)} required/></label><button className="button primary" disabled={profileBusy}>Save profile</button></form></section>
  <section className="panel-card profile-form-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><ShieldCheck size={17}/></div><div><b>Password & security</b><small>Change your account password</small></div></div></div><form className="profile-form" onSubmit={async event=>{event.preventDefault();setProfileBusy(true);setProfileError("");setProfileMessage("");try{const response=await fetch(`${API}/api/profile/password`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword:profileCurrentPassword,newPassword:profileNewPassword})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"Password change failed");setProfileCurrentPassword("");setProfileNewPassword("");setProfileMessage("Password updated.");}catch(error){setProfileError(error instanceof Error?error.message:"Password change failed");}finally{setProfileBusy(false);}}}><label className="auth-label">Current password<input type="password" value={profileCurrentPassword} onChange={event=>setProfileCurrentPassword(event.target.value)} required autoComplete="current-password"/></label><label className="auth-label">New password<input type="password" value={profileNewPassword} onChange={event=>setProfileNewPassword(event.target.value)} minLength={12} required autoComplete="new-password"/></label><button className="button primary" disabled={profileBusy}>Change password</button></form></section>
  <section className="panel-card profile-form-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><Settings2 size={17}/></div><div><b>Preferences</b><small>Personalize your panel</small></div></div></div><form className="profile-form" onSubmit={async event=>{event.preventDefault();setProfileBusy(true);setProfileError("");setProfileMessage("");try{const response=await fetch(`${API}/api/profile/preferences`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({theme:profileTheme,notification_sound:profileSound,about:profileAbout})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"Preferences save failed");setProfileMessage("Preferences saved.");}catch(error){setProfileError(error instanceof Error?error.message:"Preferences save failed");}finally{setProfileBusy(false);}}}><label className="auth-label">Theme<select value={profileTheme} onChange={event=>setProfileTheme(event.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="dark-purple">Dark purple</option><option value="dark-blue-purple">Dark blue-purple</option><option value="dark-red-purple-pink-blue">Red-purple-pink-blue</option></select></label><label className="preference-check"><input type="checkbox" checked={profileSound} onChange={event=>setProfileSound(event.target.checked)}/> Notification sound enabled</label><label className="auth-label">About me<textarea value={profileAbout} onChange={event=>setProfileAbout(event.target.value)} maxLength={1000} rows={4}/></label><button className="button primary" disabled={profileBusy}>Save preferences</button></form></section>
  {profileError && <div className="alert error"><ShieldCheck size={18}/><div><b>Could not save changes</b><p>{profileError}</p></div></div>}{profileMessage && <div className="alert setup"><ShieldCheck size={18}/><div><b>{profileMessage}</b></div></div>}
</div> : <section className="panel-card">
{adminActionError && <p className="credential-error">{adminActionError}</p>}{adminActionMessage && <p className="admin-action-message">{adminActionMessage}</p>}
{active === "Settings" && <form className="admin-inline-form" onSubmit={async event=>{event.preventDefault();setAdminActionBusy(true);setAdminActionError("");setAdminActionMessage("");try{const value=settingKey==="registration.enabled"?settingValue.toLowerCase()==="true":settingValue;const response=await fetch(`${API}/api/admin/settings/${encodeURIComponent(settingKey)}`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({value})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"Setting update failed");setAdminActionMessage("Setting saved.");setResourceRefresh(v=>v+1);}catch(error){setAdminActionError(error instanceof Error?error.message:"Setting update failed");}finally{setAdminActionBusy(false);}}}><b>Update panel setting</b><select value={settingKey} onChange={event=>setSettingKey(event.target.value)}><option value="site.name">Site name</option><option value="site.description">Site description</option><option value="registration.enabled">Registration enabled (true/false)</option><option value="support.url">Support URL</option><option value="links.discord">Discord link</option><option value="links.youtube">YouTube link</option><option value="links.website">Website link</option></select><input value={settingValue} onChange={event=>setSettingValue(event.target.value)} placeholder="Setting value" required/><button className="button primary" disabled={adminActionBusy}>Save setting</button></form>}
{active === "Users" && <form className="admin-inline-form" onSubmit={async event=>{event.preventDefault();setAdminActionBusy(true);setAdminActionError("");setAdminActionMessage("");try{const response=await fetch(`${API}/api/admin/users`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:newUserEmail,username:newUserName,password:newUserPassword,role:"user"})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"User creation failed");setNewUserEmail("");setNewUserName("");setNewUserPassword("");setAdminActionMessage("User created.");setResourceRefresh(value=>value+1);}catch(error){setAdminActionError(error instanceof Error?error.message:"User creation failed");}finally{setAdminActionBusy(false);}}}><b>Create user</b><input type="email" placeholder="Email" value={newUserEmail} onChange={event=>setNewUserEmail(event.target.value)} required/><input placeholder="Username" value={newUserName} onChange={event=>setNewUserName(event.target.value)} minLength={3} required/><input type="password" placeholder="Temporary password (12+ characters)" value={newUserPassword} onChange={event=>setNewUserPassword(event.target.value)} minLength={12} required/><button className="button primary" disabled={adminActionBusy}>Create user</button></form>}
{active === "Plans" && <form className="admin-inline-form" onSubmit={async event=>{event.preventDefault();setAdminActionBusy(true);setAdminActionError("");setAdminActionMessage("");try{const response=await fetch(`${API}/api/admin/plans`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan_key:newPlanKey,name:newPlanName,memory_mb:Number(newPlanMemory),disk_mb:Number(newPlanDisk),cpu_percent:Number(newPlanCpu),price_cents:Number(newPlanPrice),description:"",is_active:true})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"Plan creation failed");setAdminActionMessage("Plan created.");setResourceRefresh(value=>value+1);}catch(error){setAdminActionError(error instanceof Error?error.message:"Plan creation failed");}finally{setAdminActionBusy(false);}}}><b>Create plan</b><input placeholder="Plan key (e.g. starter)" value={newPlanKey} onChange={event=>setNewPlanKey(event.target.value)} required/><input placeholder="Plan name" value={newPlanName} onChange={event=>setNewPlanName(event.target.value)} required/><input type="number" placeholder="Memory MB" value={newPlanMemory} onChange={event=>setNewPlanMemory(event.target.value)} min="1" required/><input type="number" placeholder="Disk MB" value={newPlanDisk} onChange={event=>setNewPlanDisk(event.target.value)} min="1" required/><input type="number" placeholder="CPU %" value={newPlanCpu} onChange={event=>setNewPlanCpu(event.target.value)} min="1" required/><input type="number" placeholder="Price in cents" value={newPlanPrice} onChange={event=>setNewPlanPrice(event.target.value)} min="0" required/><button className="button primary" disabled={adminActionBusy}>Create plan</button></form>}
{active === "Redeem Codes" && <form className="admin-inline-form" onSubmit={async event=>{event.preventDefault();setAdminActionBusy(true);setAdminActionError("");setAdminActionMessage("");setCreatedRedeemCode("");try{const response=await fetch(`${API}/api/admin/redeem-codes`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan_key:redeemPlanKey,duration_days:Number(redeemDays),max_uses:Number(redeemUses)})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"Code creation failed");setCreatedRedeemCode(payload.code);setAdminActionMessage("Code created. Copy it now; it is only shown once.");setResourceRefresh(value=>value+1);}catch(error){setAdminActionError(error instanceof Error?error.message:"Code creation failed");}finally{setAdminActionBusy(false);}}}><b>Create redeem code</b><input placeholder="Existing active plan key" value={redeemPlanKey} onChange={event=>setRedeemPlanKey(event.target.value)} required/><input type="number" value={redeemDays} onChange={event=>setRedeemDays(event.target.value)} min="1" max="3650" required/><input type="number" value={redeemUses} onChange={event=>setRedeemUses(event.target.value)} min="1" max="100000" required/><button className="button primary" disabled={adminActionBusy}>Generate code</button>{createdRedeemCode && <button className="button secondary" type="button" onClick={()=>void navigator.clipboard.writeText(createdRedeemCode)}>Copy {createdRedeemCode}</button>}</form>}
{active === "Balance" && <form className="admin-inline-form" onSubmit={async event=>{event.preventDefault();setAdminActionBusy(true);setAdminActionError("");setAdminActionMessage("");try{const response=await fetch(`${API}/api/admin/balances/${encodeURIComponent(balanceUserId)}/adjust`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount_cents:Number(balanceAmount),reason:balanceReason})});const payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.error||"Balance adjustment failed");setAdminActionMessage("Balance updated.");setResourceRefresh(value=>value+1);}catch(error){setAdminActionError(error instanceof Error?error.message:"Balance adjustment failed");}finally{setAdminActionBusy(false);}}}><b>Adjust balance</b><input placeholder="User ID" value={balanceUserId} onChange={event=>setBalanceUserId(event.target.value)} required/><input type="number" placeholder="Amount in cents (+/-)" value={balanceAmount} onChange={event=>setBalanceAmount(event.target.value)} min="-100000000" max="100000000" required/><input placeholder="Reason" value={balanceReason} onChange={event=>setBalanceReason(event.target.value)} minLength={3} required/><button className="button primary" disabled={adminActionBusy}>Apply adjustment</button></form>}
<div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><Database size={17}/></div><div><b>{active}</b><small>{resourceLoading ? "Loading live data…" : `${resourceRecords.length} records returned`}</small></div></div><button className="button secondary" onClick={() => setResourceRefresh(value => value + 1)} disabled={resourceLoading}><RefreshCw size={15} className={resourceLoading ? "spin" : ""}/> Refresh</button></div><div className="table-wrap"><table><thead><tr>{(resourceRecords.length ? Object.keys(resourceRecords[0]) : ["Data"]).map(key => <th key={key}>{key.replace(/_/g, " ").toUpperCase()}</th>)}</tr></thead><tbody>{resourceLoading ? <tr><td className="empty-row" colSpan={Math.max(1,Object.keys(resourceRecords[0] ?? {}).length)}>Loading…</td></tr> : resourceRecords.length ? resourceRecords.map((record,index) => <tr key={String(record.id ?? record.uuid ?? index)}>{Object.keys(resourceRecords[0]).map(key => <td key={key}>{record[key] === null || record[key] === undefined ? "—" : typeof record[key] === "object" ? JSON.stringify(record[key]) : String(record[key])}</td>)}</tr>) : <tr><td className="empty-row" colSpan={1}>{resourceError ? "Data could not be loaded." : "No records returned by the configured source."}</td></tr>}</tbody></table></div></section>}</section> : <>
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR INFRASTRUCTURE</div><h1>{active === "Overview" ? "Overview" : active}</h1><p className="subtitle">Monitor your game servers and manage your infrastructure.</p></div><div className="header-buttons"><button className="button secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""}/> Refresh</button><button className="button primary" onClick={() => { setActive("Servers"); }}><Plus size={16}/> View servers</button></div></section>

        {error && <div className="alert error"><ShieldCheck size={18}/><div><b>API connection issue</b><p>{error}</p></div><button className="icon-btn" onClick={() => void refresh()} aria-label="Retry"><RefreshCw size={15}/></button></div>}
        {authUser?.role === "admin" && health?.pterodactyl !== "configured" && !error && <div className="alert setup"><div className="setup-icon"><Zap size={19}/></div><div><b>Connect your Pterodactyl panel</b><p>Set the panel URL and Application API key in the backend <code>.env</code> file. The key is never sent to this browser.</p><a href="https://pterodactyl.io/panel/1.0/getting_started.html" target="_blank" rel="noreferrer">Pterodactyl setup guide <ArrowUpRight size={13}/></a></div></div>}

        <section className="panel-card credential-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><ShieldCheck size={17}/></div><div><b>Your Pterodactyl Client API</b><small>{credentialConnected ? "Credential is encrypted on the API server." : "Connect your own key to access your servers and console."}</small></div></div><span className={`health-chip ${credentialConnected ? "healthy" : "waiting"}`}>{credentialConnected ? "Connected" : "Not connected"}</span></div><form className="credential-form" onSubmit={async event => { event.preventDefault(); setCredentialBusy(true); setCredentialError(""); try { const response = await fetch(`${API}/api/profile/pterodactyl-credential`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: clientApiKey }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message || payload.error || "Could not connect"); setCredentialConnected(true); setClientApiKey(""); } catch (error) { setCredentialError(error instanceof Error ? error.message : "Could not connect"); } finally { setCredentialBusy(false); } }}><label className="auth-label">Client API key<input type="password" autoComplete="off" value={clientApiKey} onChange={event => setClientApiKey(event.target.value)} placeholder="Paste your Pterodactyl Client API key" minLength={20} maxLength={300}/></label><button className="button primary" type="submit" disabled={credentialBusy || clientApiKey.length < 20}>{credentialBusy ? "Connecting…" : "Connect key"}</button>{credentialConnected && <button className="button secondary" type="button" onClick={async () => { await fetch(`${API}/api/profile/pterodactyl-credential`, { method: "DELETE", credentials: "include" }); setCredentialConnected(false); setServers([]); }}>Disconnect</button>}</form>{credentialError && <p className="credential-error">{credentialError}</p>}<p className="credential-help">Use your own Pterodactyl Client API key. It is never returned to the browser, and Pterodactyl still enforces your server permissions.</p></section>

        <section className="section-heading"><div><h2>Infrastructure</h2><p>Live totals from your Pterodactyl installation.</p></div><span className="live-label"><span className="status-dot good"/>{isConnected ? "LIVE CONNECTION" : "AWAITING CONNECTION"}</span></section>
        <div className="stats-grid">{stats.map((stat, i) => <article className="stat-card" key={stat.label}><div className="stat-top"><div className={`stat-icon icon-${i}`}><stat.icon size={18}/></div><span className="stat-kicker">{["SERVERS","ACTIVITY","NODES","LOCATIONS"][i]}</span></div><div className="stat-value">{loading ? <span className="skeleton"/> : stat.value}</div><div className="stat-bottom"><span>{stat.label}</span><span className="stat-detail">{stat.detail}</span></div></article>)}</div>

        <section className="section-heading servers-heading"><div><h2>Server overview</h2><p>Servers retrieved from your connected panel.</p></div><button className="text-button" onClick={() => setActive("Servers")}>All servers <ArrowUpRight size={14}/></button></section>
        <section className="panel-card"><div className="table-toolbar"><div className="table-title"><div className="table-title-icon"><TerminalSquare size={17}/></div><div><b>All servers</b><small>{overview ? `${overview.servers} servers in your panel` : "Connect your panel to load servers"}</small></div></div><label className="search-box"><Search size={15}/><input placeholder="Search servers..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></label></div>
          <div className="table-wrap"><table><thead><tr><th>SERVER</th><th>STATUS</th><th>NODE</th><th>MEMORY LIMIT</th><th>CPU LIMIT</th><th/></tr></thead><tbody>
            {loading ? <tr><td colSpan={6} className="empty-row"><RefreshCw size={17} className="spin"/> Connecting to your panel…</td></tr> : filtered.length ? filtered.slice(0, 8).map(s => <tr key={s.uuid}><td><div className="server-cell"><div className="server-avatar"><Server size={16}/></div><div><b>{s.name}</b><small>{s.identifier}</small></div></div></td><td><span className={`server-status ${s.status === "running" ? "running" : s.status === "suspended" ? "suspended" : "stopped"}`}><span/>{s.status}</span></td><td><span className="node-cell"><Network size={13}/> Node {s.node}</span></td><td>{s.limits.memory ? `${(s.limits.memory / 1024).toFixed(1)} GB` : "—"}</td><td>{s.limits.cpu ? `${s.limits.cpu}%` : "Unlimited"}</td><td><div className="server-power-actions">{credentialConnected && (["start","restart","stop"] as const).map(signal => <button key={signal} className="row-action" disabled={powerBusy === s.identifier} aria-label={signal + " " + s.name} title={signal} onClick={async () => { setPowerBusy(s.identifier); setCredentialError(""); try { const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(s.identifier)}/power`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signal }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message || payload.error || "Power action failed"); } catch (error) { setCredentialError(error instanceof Error ? error.message : "Power action failed"); } finally { setPowerBusy(""); } }}><span>{signal === "start" ? "▶" : signal === "restart" ? "↻" : "■"}</span></button>)}<button className="row-action" aria-label={`Open ${s.name} console`} onClick={() => setSelectedServer(s)}><ArrowUpRight size={15}/></button></div></td></tr>) : <tr><td colSpan={6} className="empty-row"><Server size={20}/><b>{isConnected ? "No matching servers" : "No server data yet"}</b><span>{isConnected ? "Try another search term." : "Once connected, real servers will appear here. No sample servers are shown."}</span></td></tr>}
          </tbody></table></div><div className="table-footer"><span>Showing <b>{filtered.length}</b> of <b>{overview?.servers ?? 0}</b> servers</span><span className="updated">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "Not yet synced"}</span></div>
        </section>

        <section className="bottom-grid"><article className="info-card"><div className="info-card-head"><div className="mini-icon purple"><Gauge size={17}/></div><div><b>Connection health</b><small>Service status</small></div><span className={`health-chip ${isConnected ? "healthy" : "waiting"}`}>{isConnected ? "Connected" : "Pending"}</span></div><div className="health-row"><span>Matrix API</span><span><i className={health?.status === "ok" ? "tiny-dot good" : "tiny-dot bad"}/>{health?.status === "ok" ? "Operational" : "Unavailable"}</span></div><div className="health-row"><span>Pterodactyl API</span><span><i className={`tiny-dot ${isConnected ? "good" : "bad"}`}/>{isConnected ? "Connected" : "Not configured"}</span></div><div className="health-row"><span>Database</span><span><i className={`tiny-dot ${health?.database === "configured" ? "good" : "bad"}`}/>{health?.database === "configured" ? "Configured" : "Not configured"}</span></div></article>
          <article className="info-card quick-card"><div className="info-card-head"><div className="mini-icon blue"><HardDrive size={17}/></div><div><b>Quick access</b><small>Common destinations</small></div></div><button onClick={() => setActive("Servers")}><span className="quick-symbol"><Server size={16}/></span><span><b>Server management</b><small>Browse your server inventory</small></span><ArrowUpRight size={15}/></button><button onClick={() => setActive("Nodes")}><span className="quick-symbol"><Cpu size={16}/></span><span><b>Node infrastructure</b><small>View configured nodes</small></span><ArrowUpRight size={15}/></button></article></section>
        <footer><span><span className="footer-mark">M</span> Matrix Panel <span className="footer-version">v0.1.0</span></span><span>Built for infrastructure that matters <ArrowUpRight size={12}/></span></footer>
        </>}
      </div>
    </main>

    {selectedServer && <div className="console-overlay" role="dialog" aria-modal="true" aria-label={selectedServer.name + " management"}>
      <section className="console-modal"><header className="console-header"><div><b>{selectedServer.name}</b><small>{selectedServer.identifier} · {serverTab === "Console" ? consoleStatus : "Server management"}</small></div><button className="icon-btn" onClick={() => setSelectedServer(null)} aria-label="Close server management"><X size={18}/></button></header>
      <nav className="server-tabs">{["Console","Minecraft","MOTD","Plugins","Files","Backups","Schedules","Databases","Network","Startup","Settings","Users"].map(tab => <button key={tab} className={serverTab === tab ? "active" : ""} onClick={() => { setServerTab(tab); setServerResourceError(""); if (tab === "Files") { setFileDirectory("/"); setFilePath(""); } if (tab === "Plugins") { setPluginQuery(""); } }}>{tab}</button>)}</nav>
      {!credentialConnected ? <div className="server-resource-empty">Connect your Pterodactyl Client API key on the dashboard to use server management.</div> :
      serverTab === "Console" ? <><div className="console-output">{consoleOutput.map((line,index) => <pre key={index}>{line}</pre>)}</div><form className="console-input-row" onSubmit={event => { event.preventDefault(); if (consoleSocket.current?.readyState === WebSocket.OPEN && consoleInput.trim()) { consoleSocket.current.send(JSON.stringify({ event: "send command", args: [consoleInput] })); setConsoleInput(""); } }}><input value={consoleInput} onChange={event => setConsoleInput(event.target.value)} placeholder="Enter a server command…" disabled={!credentialConnected}/><button className="button primary" type="submit" disabled={!credentialConnected || !consoleInput.trim()}>Send</button></form></> :
      serverTab === "MOTD" ? <div className="server-resource-view minecraft-manager motd-manager"><div className="file-toolbar"><div><b>Minecraft MOTD Changer</b><p className="subtitle">Edit the message shown in the server list. Changes take effect after a server restart.</p></div><button className="button secondary" disabled={motdBusy} onClick={async()=>{setMotdBusy(true);setMotdFeedback("");try{const response=await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files/contents?file=${encodeURIComponent("/server.properties")}`,{credentials:"include"});const text=await response.text();if(!response.ok)throw new Error(text||"Could not read server.properties");const line=text.split(/\r?\n/).find(row=>/^\s*motd\s*=/.test(row));setMotdFileContent(text);setMotdValue(line?line.slice(line.indexOf("=")+1):"");setMotdFeedback("Loaded server.properties.");}catch(error){setMotdFeedback(error instanceof Error?error.message:"Could not load MOTD");}finally{setMotdBusy(false);}}}><RefreshCw size={14}/> Load current MOTD</button></div><label className="auth-label">Server list message<input value={motdValue} onChange={event=>setMotdValue(event.target.value.replace(/[\r\n]/g,"").slice(0,255))} maxLength={255} placeholder="Welcome to my Minecraft server!" disabled={motdFileContent===null}/></label><div className="motd-preview"><span className="motd-preview-icon">M</span><div><b>{selectedServer.name}</b><p>{motdFileContent===null?"Load server.properties to preview your current message.":motdValue||"A Minecraft Server"}</p></div><span className="motd-preview-version">1.20.x</span></div><div className="minecraft-quick-actions"><button className="button primary" disabled={motdBusy||motdFileContent===null||!motdValue.trim()} onClick={async()=>{setMotdBusy(true);setMotdFeedback("");try{const lines=(motdFileContent??"").split(/\r?\n/);const index=lines.findIndex(row=>/^\s*motd\s*=/.test(row));if(index>=0)lines[index]="motd="+motdValue;else lines.push("motd="+motdValue);const content=lines.join("\n");const response=await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files/contents?file=${encodeURIComponent("/server.properties")}`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||payload.error||"Could not save MOTD");setMotdFileContent(content);setMotdFeedback("MOTD saved to server.properties. Restart the server for the change to appear.");}catch(error){setMotdFeedback(error instanceof Error?error.message:"Could not save MOTD");}finally{setMotdBusy(false);}}}><ShieldCheck size={14}/> Save MOTD</button><button className="button secondary" disabled={motdBusy||motdFileContent===null} onClick={()=>{const line=(motdFileContent??"").split(/\r?\n/).find(row=>/^\s*motd\s*=/.test(row));setMotdValue(line?line.slice(line.indexOf("=")+1):"");setMotdFeedback("Changes reverted.");}}>Discard changes</button></div>{motdFeedback&&<p className="credential-help" role="status">{motdFeedback}</p>}<div className="alert setup"><div className="setup-icon"><ShieldCheck size={18}/></div><div><b>Restart required</b><p>This edits the server.properties file directly. Keep a backup before changing server settings; save requires file-write permission for this server.</p></div></div></div> :
      serverTab === "Minecraft" ? <div className="server-resource-view minecraft-manager"><div className="file-toolbar"><div><b>Minecraft Player Manager</b><p className="subtitle">Run player management commands on this server.</p></div></div><form className="console-input-row" onSubmit={event => { event.preventDefault(); const name = playerName.trim(); if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { setPlayerFeedback("Enter a valid Minecraft username (3–16 letters, numbers, or underscores)."); return; } if (consoleSocket.current?.readyState !== WebSocket.OPEN) { setPlayerFeedback("Console is not connected. Switch to Console and wait for it to connect."); return; } consoleSocket.current.send(JSON.stringify({event:"send command",args:[playerAction + " " + name]})); setPlayerFeedback("Command sent: " + playerAction + " " + name); }}><select value={playerAction} onChange={event=>setPlayerAction(event.target.value)} aria-label="Player action"><option value="whitelist add">Whitelist player</option><option value="whitelist remove">Remove from whitelist</option><option value="op">Give operator</option><option value="deop">Remove operator</option><option value="ban">Ban player</option><option value="pardon">Unban player</option><option value="kick">Kick player</option></select><input value={playerName} onChange={event=>setPlayerName(event.target.value)} placeholder="Minecraft username" minLength={3} maxLength={16} required/><button className="button primary" type="submit">Run command</button></form>{playerFeedback && <p className="credential-help" role="status">{playerFeedback}</p>}<div className="alert setup"><div className="setup-icon"><ShieldCheck size={18}/></div><div><b>Server console permissions apply</b><p>Commands run as the server console. Only use operator, ban, and whitelist actions when you have permission to manage this server.</p></div></div><div className="file-toolbar"><b>Quick commands</b></div><div className="minecraft-quick-actions">{[{label:"List online players",command:"list"},{label:"Show whitelist",command:"whitelist list"},{label:"Reload whitelist",command:"whitelist reload"}].map(item=><button key={item.command} className="button secondary" onClick={()=>{if(consoleSocket.current?.readyState===WebSocket.OPEN){consoleSocket.current.send(JSON.stringify({event:"send command",args:[item.command]}));setPlayerFeedback("Command sent: "+item.command);}else setPlayerFeedback("Console is not connected. Switch to Console and wait for it to connect.");}}>{item.label}</button>)}</div></div> :
      serverTab === "Plugins" ? <div className="server-resource-view plugin-manager">
        <div className="file-toolbar">
          <div><b>Plugin Manager</b><p className="subtitle">View JAR files in this server's /plugins directory.</p></div>
          <button className="button secondary" disabled={serverResourceLoading} onClick={async () => {
            setServerResourceLoading(true);
            setServerResourceError("");
            try {
              const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files?directory=${encodeURIComponent("/plugins")}`, { credentials: "include" });
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.message || payload.error || "Could not load plugins directory");
              setFileEntries(Array.isArray(payload.data) ? payload.data.map((entry: any) => entry.attributes ?? entry) : []);
            } catch (error) {
              setServerResourceError(error instanceof Error ? error.message : "Could not load plugins");
            } finally {
              setServerResourceLoading(false);
            }
          }}><RefreshCw size={14}/> Refresh</button>
        </div>
        <label className="plugin-search">Search installed plugins<input value={pluginQuery} onChange={event => setPluginQuery(event.target.value)} placeholder="Search .jar files…"/></label>
        {serverResourceError && <p className="credential-error">{serverResourceError}</p>}
        {serverResourceLoading ? <p>Loading plugin directory…</p> : <div className="plugin-list">
          {fileEntries.filter(entry => Boolean(entry.is_file ?? entry.isFile ?? true) && String(entry.name ?? "").toLowerCase().endsWith(".jar") && String(entry.name ?? "").toLowerCase().includes(pluginQuery.toLowerCase())).map((entry, index) => <div className="plugin-row" key={String(entry.name ?? "plugin") + index}>
            <span className="plugin-file-icon">JAR</span>
            <div className="plugin-details"><b>{String(entry.name ?? "Unnamed plugin")}</b><small>{entry.size != null ? (Number(entry.size) / 1024 / 1024).toFixed(2) + " MB" : "Plugin archive"} · /plugins</small></div>
          </div>)}
          {fileEntries.filter(entry => Boolean(entry.is_file ?? entry.isFile ?? true) && String(entry.name ?? "").toLowerCase().endsWith(".jar") && String(entry.name ?? "").toLowerCase().includes(pluginQuery.toLowerCase())).length === 0 && <div className="plugin-empty"><b>{pluginQuery ? "No matching JAR files" : "No plugin JAR files found"}</b><p>{pluginQuery ? "Try another search term." : "Check that this server uses a plugin-compatible Minecraft server, then refresh."}</p></div>}
        </div>}
        <div className="alert setup"><div className="setup-icon"><ShieldCheck size={18}/></div><div><b>Plugin safety</b><p>Only install trusted plugins. Keep a backup before making server changes, and restart the server after plugin updates.</p></div></div>
      </div> :
      serverTab === "Files" ? <div className="file-manager"><div className="file-toolbar"><button className="button secondary" disabled={fileDirectory === "/"} onClick={() => setFileDirectory(fileDirectory.split("/").filter(Boolean).slice(0,-1).length ? "/" + fileDirectory.split("/").filter(Boolean).slice(0,-1).join("/") : "/")}>Up</button><span>{fileDirectory}</span></div>{serverResourceError && <p className="credential-error">{serverResourceError}</p>}{filePath ? <><div className="file-toolbar"><b>{filePath}</b><button className="button secondary" onClick={() => { setFilePath(""); setFileDirty(false); }}>Back</button><button className="button primary" disabled={!fileDirty} onClick={async () => { const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files/contents?file=${encodeURIComponent(filePath)}`, {method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:fileContent})}); if (!response.ok) { const p = await response.json(); setServerResourceError(p.message || p.error || "Save failed"); } else setFileDirty(false); }}>Save</button></div><textarea className="file-editor" value={fileContent} onChange={event => { setFileContent(event.target.value); setFileDirty(true); }} spellCheck={false}/></> : <div className="file-list">{serverResourceLoading ? <p>Loading files…</p> : fileEntries.map((entry,index) => { const name = String(entry.name ?? "Unnamed"); const isFile = Boolean(entry.is_file ?? entry.isFile ?? true); return <button key={name + index} onClick={async () => { const path = (fileDirectory === "/" ? "" : fileDirectory) + "/" + name; if (!isFile) { setFileDirectory(path); return; } setServerResourceError(""); const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files/contents?file=${encodeURIComponent(path)}`, {credentials:"include"}); const content = await response.text(); if (!response.ok) { setServerResourceError(content || "Could not read file"); return; } setFilePath(path); setFileContent(content); setFileDirty(false); }}>{isFile ? "▤" : "▣"} <b>{name}</b><small>{isFile ? String(entry.size ?? "file") : "folder"}</small></button>; })}</div>}</div> :
      <div className="server-resource-view">{serverTab === "Backups" && <div className="file-toolbar"><span>Create a server backup</span><button className="button primary" onClick={async () => { const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/backups`, {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}); if (!response.ok) { const p = await response.json(); setServerResourceError(p.message || p.error || "Backup creation failed"); } else setServerResourceError("Backup request submitted."); }}><Plus size={14}/> Create backup</button></div>}{serverResourceError && <p className="credential-error">{serverResourceError}</p>}{serverResourceLoading ? <p>Loading {serverTab.toLowerCase()}…</p> : <pre>{JSON.stringify(serverResource,null,2)}</pre>}</div>}
      <p className="credential-help">All actions use your own Pterodactyl Client API key and its permissions.</p></section></div>}
  </div>;
}
