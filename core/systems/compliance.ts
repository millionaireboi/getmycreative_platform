import { User } from '../types/index.ts';

/**
 * The Audit/Compliance system is responsible for logging critical events
 * for security, monitoring, and regulatory purposes.
 */

enum AuditEvent {
    USER_LOGIN = 'USER_LOGIN',
    USER_LOGOUT = 'USER_LOGOUT',
    TEMPLATE_DELETED = 'TEMPLATE_DELETED',
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    PROJECT_CREATED = 'PROJECT_CREATED'
}

interface AuditLog {
    timestamp: Date;
    actor: User | { id: string, email: string };
    event: AuditEvent;
    details: Record<string, any>; // Contextual information about the event
}

/**
 * Logs an important action taken within the system.
 * 
 * @param actor The user who performed the action.
 * @param event The type of event that occurred.
 * @param details A JSON object with relevant details about the event.
 */
export const logAuditEvent = (actor: User, event: AuditEvent, details: Record<string, any>): void => {
    const log: AuditLog = {
        timestamp: new Date(),
        actor: { id: actor.id, email: actor.email },
        event,
        details,
    };
    
    // In a real application, this would write to a secure, immutable log store
    // (e.g., AWS CloudWatch Logs, a dedicated logging service, or a database table).
    console.log('AUDIT LOG:', JSON.stringify(log, null, 2));
};
