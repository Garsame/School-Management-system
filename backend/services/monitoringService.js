const MAX_POINTS = 5000;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const state = {
    points: []
};

const trimOld = (now = Date.now()) => {
    const cutoff = now - WINDOW_MS;
    while (state.points.length && state.points[0].timestamp < cutoff) {
        state.points.shift();
    }
    if (state.points.length > MAX_POINTS) {
        state.points.splice(0, state.points.length - MAX_POINTS);
    }
};

const recordRequest = ({ method, path, statusCode, durationMs }) => {
    const point = {
        timestamp: Date.now(),
        method,
        path,
        statusCode,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0
    };
    state.points.push(point);
    trimOld(point.timestamp);
};

const average = (arr) => {
    if (!arr.length) return 0;
    return arr.reduce((sum, value) => sum + value, 0) / arr.length;
};

const percentile = (arr, p) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
};

const toHourlySeries = (points, now = Date.now()) => {
    const hourMs = 60 * 60 * 1000;
    const buckets = Array.from({ length: 24 }, (_, i) => {
        const bucketStart = now - (23 - i) * hourMs;
        return { start: bucketStart - (bucketStart % hourMs), values: [] };
    });

    points.forEach((point) => {
        const diff = now - point.timestamp;
        if (diff < 0 || diff > WINDOW_MS) return;
        const hourIndex = 23 - Math.floor(diff / hourMs);
        if (hourIndex >= 0 && hourIndex < 24) {
            buckets[hourIndex].values.push(point.durationMs);
        }
    });

    return buckets.map((bucket) => {
        const date = new Date(bucket.start);
        const label = `${String(date.getHours()).padStart(2, '0')}:00`;
        const valueMs = average(bucket.values);
        return { label, valueMs: Number(valueMs.toFixed(2)), count: bucket.values.length };
    });
};

const getSnapshot = () => {
    const now = Date.now();
    trimOld(now);

    const points = state.points;
    const durations = points.map((point) => point.durationMs);
    const totalRequests = points.length;
    const errorRequests = points.filter((point) => point.statusCode >= 400).length;
    const avgResponseMs = average(durations);
    const p95ResponseMs = percentile(durations, 95);
    const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
    const recentErrors = points
        .filter((point) => point.statusCode >= 400)
        .slice(-20)
        .reverse()
        .map((point) => ({
            timestamp: point.timestamp,
            path: point.path,
            method: point.method,
            statusCode: point.statusCode,
            durationMs: Number(point.durationMs.toFixed(2))
        }));

    return {
        totalRequests,
        errorRequests,
        avgResponseMs: Number(avgResponseMs.toFixed(2)),
        p95ResponseMs: Number(p95ResponseMs.toFixed(2)),
        errorRate: Number(errorRate.toFixed(2)),
        responseTimeSeries: toHourlySeries(points, now),
        recentErrors
    };
};

module.exports = {
    recordRequest,
    getSnapshot
};
