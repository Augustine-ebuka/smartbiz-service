import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { uploadLogo, uploadFile, uploadAvatar } from '../middlewares/uploadMidleware';
import UploadController from '../controllers/uploadCntroller';

const router = Router();

router.use(authenticateToken);

// POST /api/upload/logo      → multipart, field: "logo"
// POST /api/upload/receipt   → multipart, field: "receipt"
// POST /api/upload/avatar    → multipart, field: "avatar"

router.post('/logo',    uploadLogo,    UploadController.uploadLogo);
router.post('/file', uploadFile, UploadController.uploadFile);
router.post('/avatar',  uploadAvatar,  UploadController.uploadAvatar);

export default router;