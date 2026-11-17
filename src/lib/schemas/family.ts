import { z } from 'zod'
import { dbId, dbIdOptional } from './ids'

const RELATIONS = ['self','spouse','parent','child','sibling','grandparent','grandchild','other'] as const
const ROLES     = ['patient','caretaker','viewer'] as const
const COLORS    = ['emerald','blue','amber','rose','violet','teal','orange','pink'] as const

/** POST /api/family/members — add a family member */
export const createMemberSchema = z.object({
  familyId:     dbId.optional().nullable(),
  name:         z.string().min(1, 'Member name is required').max(120),
  relation:     z.enum(RELATIONS).optional().default('self'),
  age:          z.coerce.number().int().min(0).max(150).optional().nullable(),
  role:         z.enum(ROLES).optional().default('patient'),
  color:        z.enum(COLORS).optional().default('emerald'),
  conditions:   z.array(z.string().max(120)).optional().default([]),
  photoUrl:     z.string().url('photoUrl must be a valid URL').max(500).optional().nullable(),
  userId:       dbIdOptional,
  /** COMPLIANCE: must be true and accompanied by guardianName when age is under 18. */
  parentalConsentGiven: z.boolean().optional().default(false),
  /** COMPLIANCE: full legal name of the parent/guardian consenting on behalf of a minor. */
  guardianName: z.string().max(120).optional().nullable(),
})

/** POST /api/family/invite — invite a family member */
export const inviteSchema = z.object({
  action:      z.enum(['invite','accept','decline']),
  email:       z.string().email().max(254).optional(),
  name:        z.string().max(120).optional(),
  relation:    z.string().max(60).optional(),
  inviteId:    dbId.optional(),
  age:         z.coerce.number().int().min(0).max(150).optional().nullable(),
  /** COMPLIANCE (COPPA/family governance): guardian verification for minors */
  guardianVerificationToken: z.string().uuid().optional().nullable(),
  /** RELATIONSHIP VERIFICATION: token received via email invite to confirm identity */
  relationVerificationToken: z.string().min(32).optional().nullable(),
  /** Role to assign on invite — caretaker gets write access */
  inviteeRole: z.enum(['patient','caretaker','viewer']).optional().default('patient'),
})

/** GET /api/family/members — query parameters */
export const familyMembersQuerySchema = z.object({
  familyId: dbId.optional(),
  role:     z.enum(ROLES).optional(),
  cursor:   z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional().default(20),
  fields:   z.string().optional(),
})
