-- =============================================================================
-- Ignyte LOI Test Bench — sample-test measurement schema (PostgreSQL)
-- =============================================================================
-- Stores ONLY the numerical values produced while testing a sample:
--   * the specimen (sample) and its measured properties
--   * each test run and its numerical results / conditions
--   * the full per-sensor numerical time series captured during the run
--
-- Deliberately EXCLUDED (not "numerical values relating to testing the sample"):
--   * operator PII (net ID, name, email) — that's about the person, not the sample
--   * motor / actuator control state (position, steps, velocity_mode) — rig control
--   * raw serial/console text and video — not numerical
--
-- Field names and units mirror lib/firmware.ts (FirmwareSample) so ingestion is
-- a direct mapping. Times: `device_t_us` is the MCU's monotonic microsecond
-- clock (NOT wall time); `recorded_at` is the host receive timestamp.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- The physical specimen under test.
-- -----------------------------------------------------------------------------
CREATE TABLE sample (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    external_id   TEXT UNIQUE,                 -- lab/specimen label, if any
    material      TEXT,                        -- optional material description
    -- Measured specimen geometry / mass (numerical; fill what you record):
    length_mm     NUMERIC(10,3),
    width_mm      NUMERIC(10,3),
    thickness_mm  NUMERIC(10,3),
    mass_g        NUMERIC(12,4),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Sensor / channel lookup. Keeps the time-series table compact and typed.
-- `key` matches firmware sensor names; `kind` matches FirmwareSample.kind.
-- -----------------------------------------------------------------------------
CREATE TABLE sensor_channel (
    id    SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key   TEXT NOT NULL UNIQUE,               -- tc1..tc4, sht45, bme688, o2, d6f_v03a1, flow1, flow2
    kind  TEXT NOT NULL,                      -- thermocouple | environment | oxygen | analog | flow_controller
    unit  TEXT NOT NULL                       -- degC | %RH | hPa | kOhm | m/s | V | %
);

-- -----------------------------------------------------------------------------
-- A single test run against one sample (e.g. one ASTM D2863 / LOI session).
-- Holds the numerical results and ambient conditions of the sample test.
-- -----------------------------------------------------------------------------
CREATE TABLE test_run (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_id            BIGINT NOT NULL REFERENCES sample(id) ON DELETE CASCADE,
    external_test_id     TEXT UNIQUE,          -- saved run artifact ID: YYYYMMDD-HHMMSS-PSETID
    pset_id              TEXT,                 -- user-entered parameter-set ID
    started_at           TIMESTAMPTZ NOT NULL,
    stopped_at           TIMESTAMPTZ,
    duration_seconds     INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    sample_count         INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
    -- Numerical results / setpoints / ambient conditions of the sample test:
    oxygen_index_pct     NUMERIC(6,3),         -- the LOI result, if computed
    o2_setpoint_pct      NUMERIC(6,3),
    n2_setpoint_pct      NUMERIC(6,3),
    ambient_temp_c       NUMERIC(6,2),
    ambient_rh_pct       NUMERIC(6,2),
    ambient_pressure_hpa NUMERIC(7,2),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_run_sample ON test_run (sample_id);
CREATE INDEX idx_test_run_started ON test_run (started_at);

-- -----------------------------------------------------------------------------
-- The bulk numerical time series: one row per sensor sample received during a
-- run. Every numerical field a FirmwareSample can carry has a typed column, so
-- nothing measured is lost. Only the columns relevant to a channel's `kind`
-- are populated; the rest stay NULL.
-- -----------------------------------------------------------------------------
CREATE TABLE sensor_reading (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    test_run_id     BIGINT   NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    channel_id      SMALLINT NOT NULL REFERENCES sensor_channel(id),
    device_t_us     BIGINT,                    -- MCU monotonic microseconds (not wall clock)
    recorded_at     TIMESTAMPTZ NOT NULL,      -- host receive time
    ok              BOOLEAN,                   -- sample validity flag, if reported

    -- thermocouple (tc1..tc4)
    temp_c          DOUBLE PRECISION,
    cold_junction_c DOUBLE PRECISION,
    fault           INTEGER,

    -- environment (sht45 / bme688)
    rh_pct          DOUBLE PRECISION,
    pressure_hpa    DOUBLE PRECISION,
    gas_kohm        DOUBLE PRECISION,

    -- oxygen (o2)
    o2_vol_pct      DOUBLE PRECISION,

    -- analog flow velocity (d6f_v03a1)
    raw_adc         INTEGER,
    voltage_v       DOUBLE PRECISION,
    velocity_m_s    DOUBLE PRECISION,

    -- flow controllers (flow1 / flow2)
    raw             INTEGER,
    pct             DOUBLE PRECISION,

    UNIQUE (test_run_id, channel_id, recorded_at)
);

-- Time-series access patterns: per-run chronological reads and per-channel scans.
CREATE INDEX idx_reading_run_time     ON sensor_reading (test_run_id, recorded_at);
CREATE INDEX idx_reading_run_channel  ON sensor_reading (test_run_id, channel_id, recorded_at);

-- Seed the known channels (matches lib/firmware.ts SENSOR_NAMES).
INSERT INTO sensor_channel (key, kind, unit) VALUES
    ('tc1',       'thermocouple',    'degC'),
    ('tc2',       'thermocouple',    'degC'),
    ('tc3',       'thermocouple',    'degC'),
    ('tc4',       'thermocouple',    'degC'),
    ('sht45',     'environment',     '%RH'),
    ('bme688',    'environment',     'hPa'),
    ('o2',        'oxygen',          '%'),
    ('d6f_v03a1', 'analog',          'm/s'),
    ('flow1',     'flow_controller', '%'),
    ('flow2',     'flow_controller', '%');

COMMIT;

-- -----------------------------------------------------------------------------
-- Optional: for high-rate captures, make sensor_reading a TimescaleDB hypertable
-- partitioned on recorded_at (drop the surrogate PK / UNIQUE accordingly):
--   SELECT create_hypertable('sensor_reading', 'recorded_at');
-- -----------------------------------------------------------------------------
