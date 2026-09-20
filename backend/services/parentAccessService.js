const User = require('../models/User');
const ParentStudentLink = require('../models/ParentStudentLink');
const { generateTemporaryPassword } = require('../utils/passwords');

const normalizeGuardian = (guardianInfo = {}) => ({
    name: String(guardianInfo.name || '').trim(),
    email: String(guardianInfo.email || '').trim().toLowerCase(),
    phone: String(guardianInfo.phone || '').trim(),
    address: String(guardianInfo.address || '').trim(),
    relationship: String(guardianInfo.relationship || 'Guardian').trim() || 'Guardian'
});

const provisionParentAccess = async ({ tenantId, student, guardianInfo, actorUserId }) => {
    const guardian = normalizeGuardian(guardianInfo);
    if (!guardian.email) {
        const error = new Error('Guardian email is required for parent portal access.');
        error.statusCode = 400;
        throw error;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardian.email)) {
        const error = new Error('Guardian email address is invalid.');
        error.statusCode = 400;
        throw error;
    }

    let parentUser = await User.findOne({ tenantId, email: guardian.email });
    if (parentUser && parentUser.role !== 'parent') {
        const error = new Error('Guardian email is already used by a non-parent account in this school.');
        error.statusCode = 409;
        throw error;
    }
    if (parentUser && !parentUser.isActive) {
        const error = new Error('The matching parent account is inactive. Ask an administrator to review it before registration.');
        error.statusCode = 409;
        throw error;
    }

    const result = {
        parentUser: null,
        temporaryPassword: null,
        createdParentUser: false,
        addedStudent: false,
        createdLink: false,
        linkId: null
    };

    if (!parentUser) {
        result.temporaryPassword = generateTemporaryPassword();
        parentUser = new User({
            tenantId,
            branchId: null,
            name: guardian.name,
            email: guardian.email,
            phone: guardian.phone,
            address: guardian.address,
            passwordHash: result.temporaryPassword,
            role: 'parent',
            scope: 'tenant',
            students: [student._id],
            mustChangePassword: true,
            isActive: true,
            createdBy: actorUserId,
            updatedBy: actorUserId
        });
        await parentUser.save();
        result.createdParentUser = true;
    } else if (!(parentUser.students || []).some((studentId) => String(studentId) === String(student._id))) {
        parentUser.students = parentUser.students || [];
        parentUser.students.push(student._id);
        parentUser.updatedBy = actorUserId;
        await parentUser.save();
        result.addedStudent = true;
    }

    result.parentUser = parentUser;
    try {
        const existingLink = result.createdParentUser
            ? null
            : await ParentStudentLink.findOne({
                tenantId,
                parentUserId: parentUser._id,
                studentId: student._id
            });
        if (!existingLink) {
            const link = await ParentStudentLink.create({
                tenantId,
                parentUserId: parentUser._id,
                studentId: student._id,
                relationship: guardian.relationship,
                isPrimaryContact: true,
                isBillingContact: true,
                isEmergencyContact: true,
                pickupAuthorized: true,
                hasPortalAccess: true,
                createdBy: actorUserId,
                updatedBy: actorUserId
            });
            result.createdLink = true;
            result.linkId = link._id;
        }
    } catch (error) {
        await rollbackParentAccess(result, tenantId, student._id);
        throw error;
    }

    return result;
};

const rollbackParentAccess = async (result, tenantId, studentId) => {
    if (!result) return;
    if (result.createdLink && result.linkId) {
        await ParentStudentLink.deleteOne({ _id: result.linkId, tenantId }).catch(() => {});
    }
    if (result.createdParentUser && result.parentUser) {
        await User.deleteOne({ _id: result.parentUser._id, tenantId, role: 'parent' }).catch(() => {});
    } else if (result.addedStudent && result.parentUser) {
        result.parentUser.students = (result.parentUser.students || []).filter((id) => String(id) !== String(studentId));
        await result.parentUser.save().catch(() => {});
    }
};

module.exports = { normalizeGuardian, provisionParentAccess, rollbackParentAccess };
