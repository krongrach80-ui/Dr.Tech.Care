<?php
/**
 * Strong Care - Appointment Controller
 * Handles REST API endpoints for appointments and trainingModes
 */

require_once __DIR__ . '/../models/Appointment.php';

class AppointmentController {
    private Appointment $appointmentModel;

    public function __construct() {
        $this->appointmentModel = new Appointment();
    }

    public function index(): void {
        if (!empty($_GET['patient_id'])) {
            $patientId = (int)$_GET['patient_id'];
            $appointments = $this->appointmentModel->getByPatientId($patientId);
        } elseif (!empty($_GET['date'])) {
            $date = trim($_GET['date']);
            $appointments = $this->appointmentModel->getByDate($date);
        } else {
            $appointments = $this->appointmentModel->getAll();
        }

        echo json_encode([
            'status' => 'success',
            'data' => $appointments
        ]);
    }

    public function show(int $id): void {
        $appointment = $this->appointmentModel->getById($id);
        if (!$appointment) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Appointment not found']);
            return;
        }

        echo json_encode([
            'status' => 'success',
            'data' => $appointment
        ]);
    }

    public function store(): void {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid JSON input']);
            return;
        }

        // Support batch creation if selectedDates array provided
        $dates = $input['selectedDates'] ?? $input['selected_dates'] ?? null;
        if (is_array($dates) && count($dates) > 1) {
            $createdIds = [];
            foreach ($dates as $d) {
                $item = $input;
                $item['appointment_date'] = $d;
                $createdIds[] = $this->appointmentModel->create($item);
            }
            http_response_code(201);
            echo json_encode([
                'status' => 'success',
                'message' => 'Batch appointments created successfully',
                'count' => count($createdIds),
                'ids' => $createdIds
            ]);
            return;
        }

        $id = $this->appointmentModel->create($input);
        $newAppointment = $this->appointmentModel->getById($id);

        http_response_code(201);
        echo json_encode([
            'status' => 'success',
            'message' => 'Appointment created successfully',
            'data' => $newAppointment
        ]);
    }

    public function update(int $id): void {
        $appointment = $this->appointmentModel->getById($id);
        if (!$appointment) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Appointment not found']);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid JSON input']);
            return;
        }

        $this->appointmentModel->update($id, $input);
        $updated = $this->appointmentModel->getById($id);

        echo json_encode([
            'status' => 'success',
            'message' => 'Appointment updated successfully',
            'data' => $updated
        ]);
    }

    public function destroy(int $id): void {
        $appointment = $this->appointmentModel->getById($id);
        if (!$appointment) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Appointment not found']);
            return;
        }

        $this->appointmentModel->delete($id);
        echo json_encode([
            'status' => 'success',
            'message' => 'Appointment deleted successfully'
        ]);
    }
}
