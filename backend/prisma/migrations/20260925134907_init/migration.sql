-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('OWNER', 'PROPERTY_MANAGER', 'TENANT');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING_VERIFICATION', 'PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('CREDENTIALS', 'GOOGLE');

-- CreateEnum
CREATE TYPE "oauth_flow_purpose" AS ENUM ('LOGIN_STATE', 'LINK_STATE', 'EXCHANGE_CODE');

-- CreateEnum
CREATE TYPE "tenant_status" AS ENUM ('APPLICANT', 'ACTIVE', 'NOTICE_PERIOD', 'MOVED_OUT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "kyc_status" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "property_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "property_type" AS ENUM ('APARTMENT', 'HOUSE', 'BUILDING', 'TOWNHOUSE', 'COMMERCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "room_type" AS ENUM ('PRIVATE', 'SHARED', 'MASTER', 'DORMITORY', 'STUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "room_operational_status" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "agreement_status" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "manager_permission" AS ENUM ('MANAGE_ROOMS', 'MANAGE_TENANTS', 'MANAGE_AGREEMENTS', 'MANAGE_RENT', 'VIEW_PAYMENTS', 'MANAGE_MAINTENANCE', 'MANAGE_INVENTORY', 'MANAGE_EXPENSES', 'MANAGE_DOCUMENTS', 'CREATE_ANNOUNCEMENTS', 'VIEW_ANALYTICS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "emailNormalized" VARCHAR(320) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100),
    "phone" VARCHAR(32),
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" "auth_provider" NOT NULL,
    "providerKey" VARCHAR(320) NOT NULL,
    "providerIssuer" VARCHAR(255),
    "providerSubject" VARCHAR(255),
    "credentialHash" TEXT,
    "providerEmail" VARCHAR(320),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "parentSessionId" UUID,
    "replacedBySessionId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revocationReason" VARCHAR(100),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "requestedIp" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_flows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "purpose" "oauth_flow_purpose" NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "nonceHash" CHAR(64),
    "codeVerifierEncrypted" TEXT,
    "redirectUri" VARCHAR(1024) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "status" "tenant_status" NOT NULL DEFAULT 'APPLICANT',
    "phone" VARCHAR(32),
    "alternatePhone" VARCHAR(32),
    "addressLine1" VARCHAR(255),
    "addressLine2" VARCHAR(255),
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "postalCode" VARCHAR(24),
    "countryCode" CHAR(2) NOT NULL DEFAULT 'IN',
    "kycStatus" "kyc_status" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "kycReference" VARCHAR(120),
    "kycVerifiedAt" TIMESTAMPTZ(3),
    "emergencyContactName" VARCHAR(160),
    "emergencyContactPhone" VARCHAR(32),
    "emergencyContactRelation" VARCHAR(80),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "property_type" NOT NULL,
    "status" "property_status" NOT NULL DEFAULT 'ACTIVE',
    "addressLine1" VARCHAR(255) NOT NULL,
    "addressLine2" VARCHAR(255),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(120) NOT NULL,
    "postalCode" VARCHAR(24) NOT NULL,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'IN',
    "timeZone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "propertyId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "buildingId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "level" INTEGER,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "floorId" UUID NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "type" "room_type" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "baseRentAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "operationalStatus" "room_operational_status" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(80),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_amenities" (
    "roomId" UUID NOT NULL,
    "amenityId" UUID NOT NULL,
    "addedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_amenities_pkey" PRIMARY KEY ("roomId","amenityId")
);

-- CreateTable
CREATE TABLE "property_manager_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "propertyId" UUID NOT NULL,
    "managerUserId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "property_manager_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_manager_permissions" (
    "assignmentId" UUID NOT NULL,
    "permission" "manager_permission" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_manager_permissions_pkey" PRIMARY KEY ("assignmentId","permission")
);

-- CreateTable
CREATE TABLE "rental_agreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "agreement_status" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "monthlyRentAmount" DECIMAL(20,2) NOT NULL,
    "securityDepositAmount" DECIMAL(20,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "activatedAt" TIMESTAMPTZ(3),
    "terminatedAt" TIMESTAMPTZ(3),
    "terminationReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rental_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agreementId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agreement_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" UUID,
    "requestId" VARCHAR(128),
    "ipAddress" VARCHAR(64),
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_emailNormalized_key" ON "users"("emailNormalized");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_providerKey_key" ON "auth_identities"("providerKey");

-- CreateIndex
CREATE INDEX "auth_identities_userId_idx" ON "auth_identities"("userId");

-- CreateIndex
CREATE INDEX "auth_identities_provider_providerIssuer_providerSubject_idx" ON "auth_identities"("provider", "providerIssuer", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_userId_provider_key" ON "auth_identities"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key" ON "refresh_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_sessions_userId_revokedAt_idx" ON "refresh_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_sessions_familyId_idx" ON "refresh_sessions"("familyId");

-- CreateIndex
CREATE INDEX "refresh_sessions_expiresAt_idx" ON "refresh_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_consumedAt_idx" ON "email_verification_tokens"("userId", "consumedAt");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_consumedAt_idx" ON "password_reset_tokens"("userId", "consumedAt");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_flows_codeHash_key" ON "oauth_flows"("codeHash");

-- CreateIndex
CREATE INDEX "oauth_flows_userId_purpose_idx" ON "oauth_flows"("userId", "purpose");

-- CreateIndex
CREATE INDEX "oauth_flows_expiresAt_idx" ON "oauth_flows"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_userId_key" ON "tenants"("userId");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "properties_ownerId_status_idx" ON "properties"("ownerId", "status");

-- CreateIndex
CREATE INDEX "properties_createdAt_idx" ON "properties"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "properties_ownerId_code_key" ON "properties"("ownerId", "code");

-- CreateIndex
CREATE INDEX "buildings_propertyId_idx" ON "buildings"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_propertyId_code_key" ON "buildings"("propertyId", "code");

-- CreateIndex
CREATE INDEX "floors_buildingId_idx" ON "floors"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "floors_buildingId_code_key" ON "floors"("buildingId", "code");

-- CreateIndex
CREATE INDEX "rooms_floorId_operationalStatus_idx" ON "rooms"("floorId", "operationalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_floorId_number_key" ON "rooms"("floorId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_code_key" ON "amenities"("code");

-- CreateIndex
CREATE INDEX "amenities_category_isActive_idx" ON "amenities"("category", "isActive");

-- CreateIndex
CREATE INDEX "room_amenities_amenityId_idx" ON "room_amenities"("amenityId");

-- CreateIndex
CREATE INDEX "property_manager_assignments_managerUserId_startDate_endDat_idx" ON "property_manager_assignments"("managerUserId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "property_manager_assignments_propertyId_idx" ON "property_manager_assignments"("propertyId");

-- CreateIndex
CREATE INDEX "rental_agreements_roomId_status_idx" ON "rental_agreements"("roomId", "status");

-- CreateIndex
CREATE INDEX "rental_agreements_status_endDate_idx" ON "rental_agreements"("status", "endDate");

-- CreateIndex
CREATE INDEX "agreement_tenants_tenantId_startDate_endDate_idx" ON "agreement_tenants"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "agreement_tenants_agreementId_idx" ON "agreement_tenants"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_tenants_agreementId_tenantId_startDate_key" ON "agreement_tenants"("agreementId", "tenantId", "startDate");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_occurredAt_idx" ON "audit_logs"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_occurredAt_idx" ON "audit_logs"("resourceType", "resourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_occurredAt_idx" ON "audit_logs"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_replacedBySessionId_fkey" FOREIGN KEY ("replacedBySessionId") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_flows" ADD CONSTRAINT "oauth_flows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_manager_assignments" ADD CONSTRAINT "property_manager_assignments_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_manager_assignments" ADD CONSTRAINT "property_manager_assignments_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_manager_assignments" ADD CONSTRAINT "property_manager_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_manager_permissions" ADD CONSTRAINT "property_manager_permissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "property_manager_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_tenants" ADD CONSTRAINT "agreement_tenants_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "rental_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_tenants" ADD CONSTRAINT "agreement_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
