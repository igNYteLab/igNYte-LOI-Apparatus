# Primary author: Will Andre Pasimio Llaneta (wpl5304)
# GitHub: https://github.com/andre-llaneta
# Project: IgNYte-FPA
# Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

import argparse
import json
import statistics
import time

import serial


COMPLETION_STATUSES = {
    "stall_detected",
    "stall_not_detected",
    "stall_test_endstop",
    "stall_test_rejected",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run bounded TMC2209 StallGuard test segments and collect sg_result samples."
    )
    parser.add_argument("--port", default="COM18", help="Serial port, for example COM18.")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate.")
    parser.add_argument(
        "--sample-interval",
        type=float,
        default=0.25,
        help="Seconds between motor.stall_status requests during each test.",
    )
    parser.add_argument(
        "--speeds",
        default="2,5,10",
        help="Comma-separated speed magnitudes in mm/s.",
    )
    parser.add_argument(
        "--max-travel-mm",
        type=float,
        default=5.0,
        help="Bounded travel for each motor.stall_test segment.",
    )
    parser.add_argument(
        "--directions",
        choices=("both", "positive", "negative"),
        default="both",
        help="Direction set to test for each speed.",
    )
    parser.add_argument(
        "--sgthrs",
        type=int,
        default=None,
        help="Optional StallGuard SGTHRS value to configure before the sweep.",
    )
    parser.add_argument(
        "--tcoolthrs",
        type=int,
        default=None,
        help="Optional TCOOLTHRS value to configure with --sgthrs.",
    )
    parser.add_argument(
        "--segment-timeout",
        type=float,
        default=None,
        help="Optional per-segment timeout in seconds. Defaults to travel/speed plus margin.",
    )
    return parser.parse_args()


def read_json_line(ser, timeout_s):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        raw = ser.readline()
        if not raw:
            continue
        line = raw.decode("utf-8", errors="replace").strip()
        if not line or not line.startswith("{"):
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None


def send_command(ser, command):
    encoded = json.dumps(command, separators=(",", ":"))
    ser.write((encoded + "\n").encode("utf-8"))
    ser.flush()
    print(">", encoded)


def wait_for_status(ser, component=None, status=None, timeout_s=3.0):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        message = read_json_line(ser, max(0.05, deadline - time.monotonic()))
        if message is None:
            continue
        print("<", json.dumps(message, separators=(",", ":")))
        if message.get("type") != "status":
            continue
        if component is not None and message.get("component") != component:
            continue
        if status is not None and message.get("status") != status:
            continue
        return message
    return None


def request_motor_status(ser, command, status, timeout_s=3.0):
    send_command(ser, command)
    return wait_for_status(ser, component="motor", status=status, timeout_s=timeout_s)


def parse_speeds(raw_speeds):
    speeds = []
    for item in raw_speeds.split(","):
        item = item.strip()
        if not item:
            continue
        speed = abs(float(item))
        if speed > 0:
            speeds.append(speed)
    return speeds


def signed_speeds(speeds, directions):
    if directions == "positive":
        return speeds
    if directions == "negative":
        return [-speed for speed in speeds]
    return [signed for speed in speeds for signed in (speed, -speed)]


def configure_stallguard(ser, sgthrs, tcoolthrs):
    if sgthrs is None and tcoolthrs is None:
        return
    if sgthrs is None or tcoolthrs is None:
        raise SystemExit("--sgthrs and --tcoolthrs must be provided together.")

    status = request_motor_status(
        ser,
        {"cmd": "motor.stall_config", "sgthrs": sgthrs, "tcoolthrs": tcoolthrs},
        "stall_configured",
        timeout_s=4.0,
    )
    if status is None:
        raise SystemExit("StallGuard configuration was not acknowledged; aborting.")


def collect_stall_test_segment(ser, velocity_mm_s, max_travel_mm, sample_interval_s, timeout_s):
    print(f"segment: stall_test velocity_mm_s={velocity_mm_s} max_travel_mm={max_travel_mm}")
    send_command(
        ser,
        {
            "cmd": "motor.stall_test",
            "mm_s": velocity_mm_s,
            "max_travel_mm": max_travel_mm,
        },
    )

    deadline = time.monotonic() + timeout_s
    next_sample_at = time.monotonic()
    samples = []
    completion = None
    started = False

    while time.monotonic() < deadline:
        now = time.monotonic()
        if now >= next_sample_at:
            send_command(ser, {"cmd": "motor.stall_status"})
            next_sample_at = now + sample_interval_s

        message = read_json_line(ser, 0.05)
        if message is None:
            continue

        print("<", json.dumps(message, separators=(",", ":")))
        if message.get("type") != "status" or message.get("component") != "motor":
            continue

        status = message.get("status")
        if status == "stall_test_started":
            started = True
        elif status == "stall_status":
            samples.append(message)
        elif status in COMPLETION_STATUSES:
            completion = message
            break

    if completion is None:
        completion = {
            "type": "status",
            "component": "motor",
            "status": "segment_timeout",
        }
        send_command(ser, {"cmd": "motor.stop"})
        wait_for_status(ser, component="motor", status="command_queued", timeout_s=1.0)

    return {
        "velocity_mm_s": velocity_mm_s,
        "started": started,
        "completion_status": completion.get("status"),
        "samples": samples,
    }


def summarize(segment):
    values = [sample["sg_result"] for sample in segment["samples"] if "sg_result" in sample]
    summary = {
        "velocity_mm_s": segment["velocity_mm_s"],
        "started": segment["started"],
        "completion_status": segment["completion_status"],
        "count": len(values),
    }
    if values:
        summary.update(
            {
                "min": min(values),
                "max": max(values),
                "mean": round(statistics.fmean(values), 2),
            }
        )
    return summary


def segment_timeout(args, speed):
    if args.segment_timeout is not None:
        return args.segment_timeout
    return max(4.0, args.max_travel_mm / max(abs(speed), 0.001) + 3.0)


def main():
    args = parse_args()
    speeds = parse_speeds(args.speeds)
    if not speeds:
        raise SystemExit("No valid nonzero speeds were provided.")

    results = []

    with serial.Serial(args.port, args.baud, timeout=0.2) as ser:
        time.sleep(2.0)
        ser.reset_input_buffer()

        driver_status = request_motor_status(
            ser, {"cmd": "motor.driver_status"}, "driver_status", timeout_s=4.0
        )
        if not driver_status or not driver_status.get("connection_ok"):
            raise SystemExit("TMC2209 UART readback failed; aborting sweep.")

        enabled_status = request_motor_status(
            ser, {"cmd": "motor.enable"}, "enabled", timeout_s=3.0
        )
        if not enabled_status or not enabled_status.get("enabled"):
            raise SystemExit("Motor did not report enabled; aborting sweep.")

        configure_stallguard(ser, args.sgthrs, args.tcoolthrs)

        try:
            for signed_speed in signed_speeds(speeds, args.directions):
                segment = collect_stall_test_segment(
                    ser,
                    signed_speed,
                    args.max_travel_mm,
                    args.sample_interval,
                    segment_timeout(args, signed_speed),
                )
                summary = summarize(segment)
                results.append(summary)
                print("summary:", json.dumps(summary, separators=(",", ":")))
                time.sleep(0.5)
        finally:
            send_command(ser, {"cmd": "motor.stop"})
            wait_for_status(ser, component="motor", status="command_queued", timeout_s=1.0)
            send_command(ser, {"cmd": "motor.disable"})
            wait_for_status(ser, component="motor", status="disabled", timeout_s=3.0)

    print("results:", json.dumps(results, separators=(",", ":")))


if __name__ == "__main__":
    main()
