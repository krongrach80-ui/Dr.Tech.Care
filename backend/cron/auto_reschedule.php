<?php
/**
 * Moh Tech Care - Daily Auto-Reschedule Cron Script
 * Runs daily ~00:05 Asia/Bangkok via Windows Task Scheduler or CLI cron
 * Idempotent: Marks past missed appointments, rolls over routine items, merges into next day
 */

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../src/Repositories/AuditRepository.php';

date_default_timezone_set('Asia/Bangkok');

echo "============================================================\n";
echo "MOH TECH CARE - DAILY AUTO-RESCHEDULE TASK\n";
echo "Timestamp: " . date('Y-m-d H:i:s') . "\n";
echo "============================================================\n";

$db = Database::getConnection();
$auditRepo = new AuditRepository();
$today = date('Y-m-d');

// 1. Find appointments with status 'scheduled' and date < today
$stmt = $db->prepare("
    SELECT a.*
    FROM appointments a
    WHERE a.status = 'scheduled'
      AND a.appointment_date < :today
      AND NOT EXISTS (
          SELECT 1 FROM session_logs sl
          WHERE sl.appointment_id = a.id
      )
");
$stmt->execute([':today' => $today]);
$missedAppts = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Found " . count($missedAppts) . " missed appointments to process.\n";

$processedCount = 0;
$rolledOverItems = 0;

foreach ($missedAppts as $appt) {
    $apptId = (int)$appt['id'];
    $patientId = $appt['patient_id'];
    $originalDate = $appt['appointment_date'];
    $tomorrowDate = date('Y-m-d', strtotime('+1 day'));

    $db->beginTransaction();
    try {
        // Mark current appointment as 'missed'
        $upd = $db->prepare("
            UPDATE appointments
            SET status = 'missed', notes = CONCAT(COALESCE(notes, ''), ' [Auto-Rescheduled: Missed on ', :orig, ']'), updated_at = :now
            WHERE id = :id
        ");
        $upd->execute([':orig' => $originalDate, ':now' => date('Y-m-d H:i:s'), ':id' => $apptId]);

        // Fetch routine items from missed appointment
        $riStmt = $db->prepare("
            SELECT * FROM routine_items
            WHERE appointment_id = :aid
        ");
        $riStmt->execute([':aid' => $apptId]);
        $items = $riStmt->fetchAll(PDO::FETCH_ASSOC);

        // Check if patient already has an appointment tomorrow
        $checkNext = $db->prepare("
            SELECT id FROM appointments
            WHERE patient_id = :pid AND appointment_date = :next_date
            LIMIT 1
        ");
        $checkNext->execute([':pid' => $patientId, ':next_date' => $tomorrowDate]);
        $existingNext = $checkNext->fetch(PDO::FETCH_ASSOC);

        $targetApptId = 0;
        if ($existingNext) {
            $targetApptId = (int)$existingNext['id'];
            echo "Merging into existing appointment #{$targetApptId} for {$tomorrowDate}...\n";
        } else {
            // Create new appointment for tomorrow
            $insAppt = $db->prepare("
                INSERT INTO appointments (patient_id, pt_id, appointment_date, status, notes, created_by)
                VALUES (:pid, :ptid, :adate, 'scheduled', :notes, 'SYSTEM_CRON')
            ");
            $insAppt->execute([
                ':pid' => $patientId,
                ':ptid' => $appt['pt_id'],
                ':adate' => $tomorrowDate,
                ':notes' => "Rolled over from missed session on {$originalDate}"
            ]);
            $targetApptId = (int)$db->lastInsertId();
            echo "Created new appointment #{$targetApptId} for {$tomorrowDate}...\n";
        }

        // Merge routine items without duplicates
        $insItem = $db->prepare("
            INSERT INTO routine_items (appointment_id, exercise_id, order_index, reps, sets, rest_seconds, custom_instructions, status)
            SELECT :target_aid, :exid, :idx, :reps, :sets, :rest, :inst, 'pending'
            WHERE NOT EXISTS (
                SELECT 1 FROM routine_items
                WHERE appointment_id = :target_aid AND exercise_id = :exid
            )
        ");

        $orderIdx = 10;
        foreach ($items as $item) {
            $insItem->execute([
                ':target_aid' => $targetApptId,
                ':exid' => $item['exercise_id'],
                ':idx' => $orderIdx++,
                ':reps' => $item['reps'],
                ':sets' => $item['sets'],
                ':rest' => $item['rest_seconds'],
                ':inst' => $item['custom_instructions']
            ]);
            if ($insItem->rowCount() > 0) {
                $rolledOverItems++;
            }
        }

        $db->commit();
        $processedCount++;
    } catch (Exception $e) {
        $db->rollBack();
        echo "Error processing appointment #{$apptId}: " . $e->getMessage() . "\n";
    }
}

// Write audit log entry
$auditRepo->log(
    null,
    'SYSTEM_AUTO_RESCHEDULE_CRON',
    'admin',
    '127.0.0.1',
    'Desktop',
    'CRON_AUTO_RESCHEDULE',
    "Processed {$processedCount} missed appointments. Rolled over {$rolledOverItems} routine items to {$today}.",
    'Normal'
);

echo "Completed. Processed: {$processedCount}, Items rolled over: {$rolledOverItems}\n";
