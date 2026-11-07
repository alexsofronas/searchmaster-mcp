/**
 * URL Security Validation for Edge Functions
 * Prevents SSRF attacks, internal network scanning, and malicious redirects
 */

const DISALLOWED_PROTOCOLS = ['file', 'ftp', 'data', 'javascript', 'about', 'blob'];

const PRIVATE_IP_RANGES = [
  /^127\./,                      // Loopback
  /^10\./,                       // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,                 // Private Class C
  /^169\.254\./,                 // Link-local
  /^::1$/,                       // IPv6 loopback
  /^fc00:/,                      // IPv6 private
  /^fe80:/,                      // IPv6 link-local
  /^ff00:/,                      // IPv6 multicast
];

const LOCALHOST_VARIANTS = [
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'ip6-localhost',
  'ip6-loopback',
];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Comprehensive URL validation to prevent security vulnerabilities
 */
export function validateWebsiteUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  // Trim and normalize
  const trimmedUrl = url.trim();
  
  if (trimmedUrl.length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Check URL length (prevent extremely long URLs)
  if (trimmedUrl.length > 2048) {
    return { valid: false, error: 'URL is too long' };
  }

  try {
    const parsed = new URL(trimmedUrl);
    
    // Check protocol - only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }
    
    // Double check for disallowed protocols (defense in depth)
    const protocolWithoutColon = parsed.protocol.replace(':', '');
    if (DISALLOWED_PROTOCOLS.includes(protocolWithoutColon.toLowerCase())) {
      return { valid: false, error: 'Disallowed protocol detected' };
    }
    
    const hostname = parsed.hostname.toLowerCase();
    
    // Block localhost variants
    if (LOCALHOST_VARIANTS.includes(hostname)) {
      return { valid: false, error: 'Localhost addresses are not allowed' };
    }
    
    // Block private IP ranges
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return { valid: false, error: 'Private IP addresses are not allowed' };
      }
    }
    
    // Check for IP address in hostname (basic check)
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(hostname)) {
      // Verify it's not a private IP
      const parts = hostname.split('.').map(Number);
      
      // Additional checks for reserved ranges
      if (parts[0] === 0 || parts[0] === 255) {
        return { valid: false, error: 'Invalid IP address' };
      }
      
      // Block 192.0.2.0/24 (TEST-NET-1)
      if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) {
        return { valid: false, error: 'Test network addresses are not allowed' };
      }
    }
    
    // Restrict ports - only standard HTTP/HTTPS
    if (parsed.port && !['80', '443', ''].includes(parsed.port)) {
      return { valid: false, error: 'Non-standard ports are not allowed' };
    }
    
    // Check for suspicious patterns in hostname
    if (hostname.includes('@') || hostname.includes('%')) {
      return { valid: false, error: 'Invalid characters in hostname' };
    }
    
    // Ensure hostname has at least one dot (basic domain check)
    if (!hostname.includes('.') && hostname !== 'localhost') {
      return { valid: false, error: 'Invalid domain format' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}
