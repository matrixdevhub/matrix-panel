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
        const directory = serverTab === "Plugins" ? <div className="server-resource-view plugin-manager"><div className="file-toolbar"><div><b>Plugin Manager</b><p className="subtitle">View JAR files in this server's /plugins directory.</p></div><button className="button secondary" disabled={serverResourceLoading} onClick={async () => { setServerResourceLoading(true); setServerResourceError(""); setPluginFeedback(""); try { const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files?directory=${encodeURIComponent("/plugins")}`, { credentials: "include" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.message || payload.error || "Could not load plugins"); setFileEntries(Array.isArray(payload.data) ? payload.data.map((entry: any) => entry.attributes ?? entry) : []); } catch (error) { setServerResourceError(error instanceof Error ? error.message : "Could not load plugins"); } finally { setServerResourceLoading(false); } }}><RefreshCw size={14}/> Refresh</button></div>{serverResourceError && <p className="credential-error">{serverResourceError}</p>}{pluginFeedback && <p className="credential-help" role="status">{pluginFeedback}</p>}{serverResourceLoading ? <p>Loading plugins…</p> : <div className="plugin-list">{fileEntries.filter(entry => String(entry.name ?? "").toLowerCase().endsWith(".jar")).map((entry, index) => <div className="plugin-row" key={String(entry.name ?? index)}><span className="plugin-file-icon">JAR</span><div className="plugin-details"><b>{String(entry.name ?? "Unnamed plugin")}</b><small>{entry.size != null ? (Number(entry.size) / 1024 / 1024).toFixed(2) + " MB" : "Plugin archive"}</small></div></div>)}{fileEntries.filter(entry => String(entry.name ?? "").toLowerCase().endsWith(".jar")).length === 0 && <div className="plugin-empty"><b>No plugin JAR files found</b><p>Check that this server uses a plugin-capable Minecraft server type, then refresh.</p></div>}</div>}<div className="alert setup"><div className="setup-icon"><ShieldCheck size={18}/></div><div><b>Plugin files</b><p>This view lists the real /plugins directory. Keep a backup before changing server files.</p></div></div></div> :
      serverTab === "Files" ? <div className="file-manager"><div className="file-toolbar"><button className="button secondary" disabled={fileDirectory === "/"} onClick={() => setFileDirectory(fileDirectory.split("/").filter(Boolean).slice(0,-1).length ? "/" + fileDirectory.split("/").filter(Boolean).slice(0,-1).join("/") : "/")}>Up</button><span>{fileDirectory}</span></div>{serverResourceError && <p className="credential-error">{serverResourceError}</p>}{filePath ? <><div className="file-toolbar"><b>{filePath}</b><button className="button secondary" onClick={() => { setFilePath(""); setFileDirty(false); }}>Back</button><button className="button primary" disabled={!fileDirty} onClick={async () => { const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files/contents?file=${encodeURIComponent(filePath)}`, {method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:fileContent})}); if (!response.ok) { const p = await response.json(); setServerResourceError(p.message || p.error || "Save failed"); } else setFileDirty(false); }}>Save</button></div><textarea className="file-editor" value={fileContent} onChange={event => { setFileContent(event.target.value); setFileDirty(true); }} spellCheck={false}/></> : <div className="file-list">{serverResourceLoading ? <p>Loading files…</p> : fileEntries.map((entry,index) => { const name = String(entry.name ?? "Unnamed"); const isFile = Boolean(entry.is_file ?? entry.isFile ?? true); return <button key={name + index} onClick={async () => { const path = (fileDirectory === "/" ? "" : fileDirectory) + "/" + name; if (!isFile) { setFileDirectory(path); return; } setServerResourceError(""); const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/files/contents?file=${encodeURIComponent(path)}`, {credentials:"include"}); const content = await response.text(); if (!response.ok) { setServerResourceError(content || "Could not read file"); return; } setFilePath(path); setFileContent(content); setFileDirty(false); }}>{isFile ? "▤" : "▣"} <b>{name}</b><small>{isFile ? String(entry.size ?? "file") : "folder"}</small></button>; })}</div>}</div> :
      <div className="server-resource-view">{serverTab === "Backups" && <div className="file-toolbar"><span>Create a server backup</span><button className="button primary" onClick={async () => { const response = await fetch(`${API}/api/profile/servers/${encodeURIComponent(selectedServer.identifier)}/backups`, {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}); if (!response.ok) { const p = await response.json(); setServerResourceError(p.message || p.error || "Backup creation failed"); } else setServerResourceError("Backup request submitted."); }}><Plus size={14}/> Create backup</button></div>}{serverResourceError && <p className="credential-error">{serverResourceError}</p>}{serverResourceLoading ? <p>Loading {serverTab.toLowerCase()}…</p> : <pre>{JSON.stringify(serverResource,null,2)}</pre>}</div>}
      <p className="credential-help">All actions use your own Pterodactyl Client API key and its permissions.</p></section></div>}
  </div>;
}
