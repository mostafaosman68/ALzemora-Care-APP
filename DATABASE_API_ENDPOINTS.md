# Database API Endpoints Reference

This is the current Express route surface for the MongoDB-backed backend.

## Health

- `GET /api/health` - health check

## Authentication

- `POST /api/auth/register` - register guardian or caregiver
- `POST /api/auth/login` - login with email, password, and patient name
- `GET /api/auth/me` - current guardian profile
- `GET /api/auth/my-patients` - list patients linked to the logged-in guardian

## Patients

- `GET /api/patients` - list patients for the current guardian
- `POST /api/patients` - create a patient
- `GET /api/patients/:id` - get one patient
- `PUT /api/patients/:id` - update one patient
- `DELETE /api/patients/:id` - delete one patient

## Heartbeat

- `POST /api/patients/:patientId/heartbeat` - add a heartbeat reading
- `GET /api/patients/:patientId/heartbeat` - list recent heartbeat readings
- `GET /api/patients/:patientId/heartbeat/latest` - get latest heartbeat reading

## Family / Known People

- `GET /api/patients/:patientId/family` - list known people for a patient
- `POST /api/patients/:patientId/family` - add a known person
- `PUT /api/patients/:patientId/family/:memberId` - update person name or relationship
- `PUT /api/patients/:patientId/family/:memberId/face` - upload face photo
- `PUT /api/patients/:patientId/family/:memberId/voice` - upload voice recording
- `DELETE /api/patients/:patientId/family/:memberId` - delete a known person
- `POST /api/patients/:patientId/family/recognize` - mock face recognition

## Medications

- `GET /api/patients/:patientId/medications` - list medications
- `GET /api/patients/:patientId/medications/today` - get today’s schedule and log state
- `POST /api/patients/:patientId/medications` - add a medication
- `PUT /api/patients/:patientId/medications/:medId` - update a medication
- `DELETE /api/patients/:patientId/medications/:medId` - delete a medication
- `POST /api/patients/:patientId/medications/:medId/schedules/:scheduleId/log` - mark a schedule taken or missed
- `POST /api/patients/:patientId/medications/detect` - mock medication detection

## Notes

- All database calls use MongoDB collections through `backend/src/database/init.js`.
- There is no SQLite or SQL API in the current backend.