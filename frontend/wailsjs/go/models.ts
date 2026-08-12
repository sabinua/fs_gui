export namespace main {
	
	export class KV {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new KV(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class ChannelDump {
	    variables: KV[];
	    fields: KV[];
	
	    static createFrom(source: any = {}) {
	        return new ChannelDump(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.variables = this.convertValues(source["variables"], KV);
	        this.fields = this.convertValues(source["fields"], KV);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SofiaProfile {
	    name: string;
	    type: string;
	    data: string;
	    state: string;
	
	    static createFrom(source: any = {}) {
	        return new SofiaProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.data = source["data"];
	        this.state = source["state"];
	    }
	}
	export class DashboardStats {
	    version: string;
	    uptimeText: string;
	    activeSessions: number;
	    peakSessions: number;
	    sessionsTotal: number;
	    sessionsPerSec: number;
	    maxSessionsRate: number;
	    maxSessions: number;
	    idleCpu: string;
	    callsCount: number;
	    sofiaProfiles: SofiaProfile[];
	    moduleCount: number;
	
	    static createFrom(source: any = {}) {
	        return new DashboardStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.uptimeText = source["uptimeText"];
	        this.activeSessions = source["activeSessions"];
	        this.peakSessions = source["peakSessions"];
	        this.sessionsTotal = source["sessionsTotal"];
	        this.sessionsPerSec = source["sessionsPerSec"];
	        this.maxSessionsRate = source["maxSessionsRate"];
	        this.maxSessions = source["maxSessions"];
	        this.idleCpu = source["idleCpu"];
	        this.callsCount = source["callsCount"];
	        this.sofiaProfiles = this.convertValues(source["sofiaProfiles"], SofiaProfile);
	        this.moduleCount = source["moduleCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DirectoryUser {
	    userId: string;
	    domain: string;
	    context: string;
	    groups: string[];
	    contact: string;
	    callGroup: string;
	    cidName: string;
	    cidNumber: string;
	    registered: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DirectoryUser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.userId = source["userId"];
	        this.domain = source["domain"];
	        this.context = source["context"];
	        this.groups = source["groups"];
	        this.contact = source["contact"];
	        this.callGroup = source["callGroup"];
	        this.cidName = source["cidName"];
	        this.cidNumber = source["cidNumber"];
	        this.registered = source["registered"];
	    }
	}
	export class FSModule {
	    name: string;
	    type: string;
	    key: string;
	
	    static createFrom(source: any = {}) {
	        return new FSModule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.key = source["key"];
	    }
	}
	
	export class PluginState {
	    manifest: plugin.Manifest;
	    enabled: boolean;
	    available: boolean;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PluginState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.manifest = this.convertValues(source["manifest"], plugin.Manifest);
	        this.enabled = source["enabled"];
	        this.available = source["available"];
	        this.active = source["active"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileSecrets {
	    eslPassword: string;
	    sshPassword: string;
	    sshPassphrase: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileSecrets(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.eslPassword = source["eslPassword"];
	        this.sshPassword = source["sshPassword"];
	        this.sshPassphrase = source["sshPassphrase"];
	    }
	}
	export class Registration {
	    user: string;
	    realm: string;
	    token: string;
	    url: string;
	    expires: number;
	    networkIp: string;
	    networkPort: string;
	    networkProto: string;
	    hostname: string;
	
	    static createFrom(source: any = {}) {
	        return new Registration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user = source["user"];
	        this.realm = source["realm"];
	        this.token = source["token"];
	        this.url = source["url"];
	        this.expires = source["expires"];
	        this.networkIp = source["networkIp"];
	        this.networkPort = source["networkPort"];
	        this.networkProto = source["networkProto"];
	        this.hostname = source["hostname"];
	    }
	}
	
	export class TestResult {
	    sshOk: boolean;
	    eslOk: boolean;
	    detail?: string;
	
	    static createFrom(source: any = {}) {
	        return new TestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sshOk = source["sshOk"];
	        this.eslOk = source["eslOk"];
	        this.detail = source["detail"];
	    }
	}

}

export namespace plugin {
	
	export class Manifest {
	    id: string;
	    name: string;
	    version: string;
	    description: string;
	    fsModules: string[];
	
	    static createFrom(source: any = {}) {
	        return new Manifest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.version = source["version"];
	        this.description = source["description"];
	        this.fsModules = source["fsModules"];
	    }
	}

}

export namespace store {
	
	export class CDRFilter {
	    number: string;
	    direction: string;
	    cause: string;
	    fromEpoch: number;
	    toEpoch: number;
	    limit: number;
	    offset: number;
	
	    static createFrom(source: any = {}) {
	        return new CDRFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.number = source["number"];
	        this.direction = source["direction"];
	        this.cause = source["cause"];
	        this.fromEpoch = source["fromEpoch"];
	        this.toEpoch = source["toEpoch"];
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	    }
	}
	export class CDRRow {
	    id: number;
	    uuid: string;
	    direction: string;
	    cidName: string;
	    cidNum: string;
	    dest: string;
	    startEpoch: number;
	    answerEpoch: number;
	    endEpoch: number;
	    duration: number;
	    billsec: number;
	    hangupCause: string;
	
	    static createFrom(source: any = {}) {
	        return new CDRRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.uuid = source["uuid"];
	        this.direction = source["direction"];
	        this.cidName = source["cidName"];
	        this.cidNum = source["cidNum"];
	        this.dest = source["dest"];
	        this.startEpoch = source["startEpoch"];
	        this.answerEpoch = source["answerEpoch"];
	        this.endEpoch = source["endEpoch"];
	        this.duration = source["duration"];
	        this.billsec = source["billsec"];
	        this.hangupCause = source["hangupCause"];
	    }
	}
	export class CDRPage {
	    rows: CDRRow[];
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new CDRPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rows = this.convertValues(source["rows"], CDRRow);
	        this.total = source["total"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Macro {
	    id: string;
	    name: string;
	    help: string;
	    template: string;
	    bg: boolean;
	    confirm: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Macro(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.help = source["help"];
	        this.template = source["template"];
	        this.bg = source["bg"];
	        this.confirm = source["confirm"];
	    }
	}
	export class Profile {
	    id: string;
	    name: string;
	    color: string;
	    eslHost: string;
	    eslPort: number;
	    useSsh: boolean;
	    sshHost: string;
	    sshPort: number;
	    sshUser: string;
	    sshAuth: string;
	    sshKeyPath: string;
	    autoConnect: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.eslHost = source["eslHost"];
	        this.eslPort = source["eslPort"];
	        this.useSsh = source["useSsh"];
	        this.sshHost = source["sshHost"];
	        this.sshPort = source["sshPort"];
	        this.sshUser = source["sshUser"];
	        this.sshAuth = source["sshAuth"];
	        this.sshKeyPath = source["sshKeyPath"];
	        this.autoConnect = source["autoConnect"];
	    }
	}

}

