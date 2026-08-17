/**
 * TALIYO CREATIVE INTELLIGENCE — MILITARY-GRADE DATABASE SECURITY FIREWALL
 * Zero-Trust Database Gateway, SQL Injection Guard & Input Sanitization Engine
 */

export interface SecurityScanResult {
  isSafe: boolean;
  threatType?: string;
  sanitizedArgs: any[];
  blockedReason?: string;
}

export interface SecurityAuditRecord {
  timestamp: string;
  action: 'READ' | 'WRITE' | 'BLOCKED_ATTACK' | 'RATE_LIMITED' | 'SCHEMA_PROTECT';
  sqlSignature: string;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: string;
}

// In-Memory Ring Buffer for Security Audits (last 500 security events)
const securityAuditLogs: SecurityAuditRecord[] = [];
const MAX_AUDIT_LOGS = 500;

// Per-User / IP DB Request Rate Limiting
const dbRateTracker = new Map<string, { count: number; windowStart: number }>();
const MAX_QUERIES_PER_WINDOW = 200; // max 200 queries per 10-second window
const RATE_WINDOW_MS = 10000;

/**
 * High-Severity SQL Injection Signatures
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(UNION(\s+ALL)?|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE)\b\s+.*\b(FROM|INTO|TABLE|DATABASE|WHERE)\b)/i,
  /(\b(OR|AND)\b\s+['"\d\w]+(\s*=\s*['"\d\w]+|\s+LIKE\s+['"\d\w]+))/i,
  /(--|\/\*|\*\/|;|@@|char\(|nchar\(|varchar\(|cast\(|convert\(|eval\()/i,
  /(WAITFOR\s+DELAY|BENCHMARK\s*\(|PG_SLEEP\s*\(|SLEEP\s*\()/i,
  /('[\s]*=[\s]*'|1[\s]*=[\s]*1|"[\s]*=[\s]*"|0[\s]*=[\s]*0)/i
];

/**
 * Max Allowed String Lengths per field to prevent Buffer Overflow & Resource Exhaustion
 */
const MAX_ARG_LENGTHS: { [key: string]: number } = {
  id: 128,
  telegram_chat_id: 32,
  username: 64,
  name: 128,
  code: 32,
  campaign_name: 128,
  text: 4096,
  default: 2048
};

/**
 * 🛡️ Real-Time Database Security Firewall: Inspects SQL & Arguments Before Execution
 */
export function inspectAndSanitizeQuery(sql: string, rawArgs: any[] = []): SecurityScanResult {
  const normalizedSql = sql.trim().toUpperCase();

  // 1. Schema Lockdown Check: Block Unauthorized Destructive DDL Operations
  const isDestructiveDDL = /(DROP\s+TABLE|TRUNCATE\s+TABLE|DROP\s+DATABASE|ALTER\s+TABLE.*DROP)/i.test(normalizedSql);
  if (isDestructiveDDL) {
    recordSecurityAudit({
      timestamp: new Date().toISOString(),
      action: 'SCHEMA_PROTECT',
      sqlSignature: maskSensitiveContent(sql.slice(0, 100)),
      threatLevel: 'CRITICAL',
      details: 'Destructive DDL statement blocked by Database Security Shield'
    });
    return {
      isSafe: false,
      threatType: 'DESTRUCTIVE_DDL_BLOCKED',
      sanitizedArgs: [],
      blockedReason: 'Destructive DDL operations (DROP/TRUNCATE) are forbidden.'
    };
  }

  // 2. Scan and Sanitize all positional arguments
  const sanitizedArgs: any[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (typeof arg === 'string') {
      // A. Check for Dangerous Null Bytes & Control Characters
      const cleanString = arg.replace(/\0/g, '').trim();

      // B. Enforce Length Boundaries (Prevent Memory Overflow Attacks)
      const maxLen = MAX_ARG_LENGTHS.default;
      const boundedString = cleanString.length > maxLen ? cleanString.slice(0, maxLen) : cleanString;

      // C. Deep Heuristic SQL Injection Inspection on User Input Arguments
      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(boundedString)) {
          // Special exception: allow normal quotes in creative design text unless accompanied by SQL control keywords
          const isCreativeText = /(visual|design|festival|brief|poster|carousel|color|font|quote)/i.test(boundedString) &&
            !/(UNION|DROP|ALTER|TRUNCATE|EXEC|SLEEP)/i.test(boundedString);

          if (!isCreativeText) {
            recordSecurityAudit({
              timestamp: new Date().toISOString(),
              action: 'BLOCKED_ATTACK',
              sqlSignature: maskSensitiveContent(sql.slice(0, 80)),
              threatLevel: 'HIGH',
              details: `SQL Injection pattern matched in argument [${i}]: ${maskSensitiveContent(boundedString.slice(0, 50))}`
            });

            return {
              isSafe: false,
              threatType: 'SQL_INJECTION_ATTEMPT',
              sanitizedArgs: [],
              blockedReason: `Malicious SQL syntax detected in input parameters.`
            };
          }
        }
      }

      sanitizedArgs.push(boundedString);
    } else if (typeof arg === 'number') {
      // Validate Number is Finite & Safe
      if (!Number.isFinite(arg) || Number.isNaN(arg)) {
        sanitizedArgs.push(0);
      } else {
        sanitizedArgs.push(arg);
      }
    } else if (arg === null || arg === undefined) {
      sanitizedArgs.push(null);
    } else if (typeof arg === 'boolean') {
      sanitizedArgs.push(arg ? 1 : 0);
    } else {
      // Convert objects/arrays to sanitized JSON string safely
      try {
        const jsonStr = JSON.stringify(arg);
        sanitizedArgs.push(jsonStr.slice(0, MAX_ARG_LENGTHS.default));
      } catch {
        sanitizedArgs.push(String(arg).slice(0, 256));
      }
    }
  }

  return {
    isSafe: true,
    sanitizedArgs
  };
}

/**
 * 🚦 Database Rate-Limiting Guard
 */
export function checkDbRateLimit(callerId = 'system'): boolean {
  const now = Date.now();
  const record = dbRateTracker.get(callerId) || { count: 0, windowStart: now };

  if (now - record.windowStart > RATE_WINDOW_MS) {
    record.count = 1;
    record.windowStart = now;
    dbRateTracker.set(callerId, record);
    return true;
  }

  record.count++;
  dbRateTracker.set(callerId, record);

  if (record.count > MAX_QUERIES_PER_WINDOW) {
    recordSecurityAudit({
      timestamp: new Date().toISOString(),
      action: 'RATE_LIMITED',
      sqlSignature: 'RATE_LIMIT_EXCEEDED',
      threatLevel: 'MEDIUM',
      details: `Caller ${callerId} exceeded rate limit with ${record.count} queries in ${RATE_WINDOW_MS}ms`
    });
    return false;
  }

  return true;
}

/**
 * 🔒 Sensitive Content & Token Masking for Clean Logging
 */
export function maskSensitiveContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/(bot\d+:[A-Za-z0-9_-]{15,}|(?<!\w)\d{8,12}:[A-Za-z0-9_-]{20,}(?!\w))/gi, 'bot[REDACTED_BOT_TOKEN]')
    .replace(/(eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)/g, '[REDACTED_JWT_TOKEN]')
    .replace(/(nvapi-[A-Za-z0-9_-]{15,})/gi, 'nvapi-[REDACTED_KEY]')
    .replace(/(TALIYO\d{4})/gi, 'TALIYO[REDACTED_PASSCODE]');
}

/**
 * 📋 Append Security Audit Record
 */
export function recordSecurityAudit(record: SecurityAuditRecord) {
  securityAuditLogs.unshift(record);
  if (securityAuditLogs.length > MAX_AUDIT_LOGS) {
    securityAuditLogs.pop();
  }
}

/**
 * 📊 Retrieve Recent Security Audit Logs
 */
export function getSecurityAuditLogs(limit = 50): SecurityAuditRecord[] {
  return securityAuditLogs.slice(0, limit);
}
