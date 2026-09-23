const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const { getExpectedScope } = require('../utils/rolePolicy');
const { getEffectivePermissions } = require('../utils/permissions');
const { resolveTenantStatus } = require('../services/tenantStatusService');
const { getAuthCookieName } = require('../utils/authCookies');

const protect = async (req, res, next) => {
    let token;

    if (!req) return next(new Error('Request object missing in middleware'));

    if (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else {
        const cookieName = getAuthCookieName();
        token = req.signedCookies?.[cookieName] || req.cookies?.[cookieName];
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Populating the role resolves permissions from the school's own Role record.
            // Users predating the Phase 1 migration have no roleId and fall back to the
            // built-in defaults for their role string.
            req.user = await User.findById(decoded.id)
                .select('-passwordHash')
                .populate('roleId');

            if (!req.user || !req.user.isActive) {
                return res.status(401).json({ message: 'User not found or inactive' });
            }
            if (decoded.ver !== undefined && decoded.ver !== (req.user.security?.tokenVersion || 0)) {
                return res.status(401).json({ message: 'Session has expired. Please sign in again.' });
            }

            req.tenantId = req.user.tenantId;
            req.branchId = req.user.branchId;
            req.role = req.user.role;
            req.scope = req.user.scope;
            req.userRole = req.user.roleId || null;
            req.permissions = getEffectivePermissions(req.user, req.userRole);

            const expectedScope = getExpectedScope(req.role);
            if (!expectedScope || expectedScope !== req.scope) {
                return res.status(403).json({ message: 'Invalid account role or scope' });
            }

            if (req.role !== 'platform_owner' && !req.tenantId) {
                return res.status(403).json({ message: 'Data integrity error: User has no tenant context' });
            }

            if (req.tenantId) {
                const tenant = await Tenant.findById(req.tenantId).select('status isActive isApproved subscription');
                if (!tenant || resolveTenantStatus(tenant) !== 'active') {
                    return res.status(403).json({
                        message: `Institution is ${tenant ? resolveTenantStatus(tenant) : 'unavailable'}`
                    });
                }
            }

            if (req.scope === 'branch') {
                if (!req.branchId) {
                    return res.status(403).json({ message: 'Branch account has no branch context' });
                }
                if (req.role === 'teacher' || req.role === 'dugsi_teacher') {
                    const requestedBranchId = req.headers?.['x-branch-id'];
                    const authorizedBranchIds = [req.user.branchId, ...(req.user.authorizedBranchIds || [])]
                        .filter(Boolean)
                        .map((branchId) => String(branchId));
                    if (requestedBranchId && !authorizedBranchIds.includes(String(requestedBranchId))) {
                        return res.status(403).json({ message: 'Teacher is not authorized for the requested branch' });
                    }
                    req.branchId = requestedBranchId || req.user.branchId;
                }
                const branch = await Branch.findOne({
                    _id: req.branchId,
                    tenantId: req.tenantId,
                    isActive: true
                }).select('_id');
                if (!branch) {
                    return res.status(403).json({ message: 'Branch is inactive or unavailable' });
                }
            }

            return next();
        } catch (error) {
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    return res.status(401).json({ message: 'Not authorized, no token' });
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.role)) {
            return res.status(403).json({ message: `Role ${req.role} is not authorized` });
        }
        next();
    };
};

const requireScope = (scope) => {
    return (req, res, next) => {
        if (req.scope !== scope) {
            return res.status(403).json({ message: `Scope ${scope} is required` });
        }
        next();
    };
};

const tenantGuard = (req, res, next) => {
    if (!req) return next(new Error('Request object missing in tenantGuard'));
    
    // Safety: For tenant routes, we MUST have a tenantId from the protect middleware
    if (!req.tenantId) {
        return res.status(403).json({ message: 'No tenant context found' });
    }

    // If it's a POST/PUT request and a tenantId is provided in body, it must match
    if (req.body && req.body.tenantId && req.tenantId) {
        if (req.body.tenantId.toString() !== req.tenantId.toString()) {
            return res.status(403).json({ message: 'Tenant mismatch. Security violation.' });
        }
    }
    
    next();
};

const branchGuard = (req, res, next) => {
    // Super admins can skip branch guard as they have tenant-wide scope
    if (req.role === 'super_admin' && req.scope === 'tenant') {
        return next();
    }

    const branchId = req.params.branchId || (req.body && req.body.branchId) || req.query.branchId;
    if (branchId && req.branchId && branchId.toString() !== req.branchId.toString()) {
        return res.status(403).json({ message: 'Branch mismatch. Security violation.' });
    }
    
    next();
};

const TeacherAssignment = require('../models/TeacherAssignment');
const Exam = require('../models/Exam');

const teacherAssignmentGuard = async (req, res, next) => {
    // Only apply to teachers. 
    // This guard ensures a teacher is only accessing data for their assigned classes/subjects.
    if (!req || req.role !== 'teacher') return next();

    try {
        const body = req.body || {};
        const query = req.query || {};
        const params = req.params || {};

        let classId = body.classId || query.classId || params.classId;
        let academicYearId = body.academicYearId || query.academicYearId || params.academicYearId;
        let subjectId = body.subjectId || query.subjectId || params.subjectId;
        const examId = body.examId || query.examId || params.examId;

        if (examId && (!classId || !subjectId || !academicYearId)) {
            const contextExam = await Exam.findOne({ 
                _id: examId, 
                tenantId: req.tenantId,
                branchId: req.branchId
            });
            
            if (contextExam) {
                classId = classId || (contextExam.classId?._id || contextExam.classId);
                subjectId = subjectId || (contextExam.subjectId?._id || contextExam.subjectId);
                academicYearId = academicYearId || contextExam.academicYearId;
            } else {
                return res.status(404).json({ success: false, message: 'Exam session not found or access denied' });
            }
        }

        if (!classId || !subjectId || !academicYearId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Academic context (class, subject, year) is required for this operation.' 
            });
        }

        const assignment = await TeacherAssignment.findOne({
            tenantId: req.tenantId,
            branchId: req.branchId,
            teacherUserId: req.user._id,
            classId: classId,
            subjectId: subjectId,
            academicYearId: academicYearId,
            isActive: true
        });

        if (!assignment) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized: You are not assigned to this specific class/subject combination.' 
            });
        }

        req.assignment = assignment;
        next();
    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.name === 'CastError' ? 'Invalid Resource ID' : 'Internal security processing error' 
        });
    }
};

module.exports = { protect, authorize, requireScope, tenantGuard, branchGuard, teacherAssignmentGuard };
