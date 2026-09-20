import React, { useState, useEffect } from 'react';
import { 
  Activity,
  Database, 
  Cpu, 
  HardDrive, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import platformService from '../../services/platformService';

const Monitoring = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Pool every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    try {
      const response = await platformService.getSystemHealth();
      setHealth(response.data);
      setError('');
    } catch (error) {
      console.error('Error fetching health status:', error);
      setError(error.response?.data?.message || 'Failed to load system health from backend.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse text-slate-500 font-medium">Connecting to system monitor...</div>;

  const serviceIconMap = {
    'Core REST API': Cpu,
    'MongoDB Cluster': Database,
    'Redis Cache': Activity,
    'File Storage': HardDrive
  };
  const serviceColorMap = {
    'Core REST API': 'text-blue-500',
    'MongoDB Cluster': 'text-emerald-500',
    'Redis Cache': 'text-rose-500',
    'File Storage': 'text-amber-500'
  };

  const services = (health?.services || [
    { name: 'Core REST API', status: health?.api },
    { name: 'MongoDB Cluster', status: health?.database },
    { name: 'Redis Cache', status: health?.redis },
    { name: 'File Storage', status: health?.storage }
  ]).map((service) => ({
    ...service,
    icon: serviceIconMap[service.name] || Activity,
    color: serviceColorMap[service.name] || 'text-slate-500'
  }));

  const responseSeries = health?.responseTimeSeries || [];
  const maxSeriesValue = Math.max(...responseSeries.map((point) => point.valueMs || 0), 1);

  const getStatusPill = (status = '') => {
    const normalized = String(status).toLowerCase();
    if (normalized.includes('operational') || normalized.includes('connected') || normalized.includes('free')) {
      return 'bg-emerald-100 text-emerald-700';
    }
    if (normalized.includes('not configured') || normalized.includes('warning') || normalized.includes('degraded')) {
      return 'bg-amber-100 text-amber-700';
    }
    return 'bg-rose-100 text-rose-700';
  };

  const overallHealthy = String(health?.healthStatus || '').toLowerCase() === 'excellent';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Monitoring</h2>
          <p className="text-slate-500 text-sm mt-1">Real-time health status and performance metrics of the platform.</p>
          {error && <p className="text-sm font-medium text-rose-600 mt-2">{error}</p>}
        </div>
        <div className={`flex items-center gap-2 font-bold px-4 py-2 rounded-xl border ${overallHealthy ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${overallHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
          {health?.healthStatus || 'Unknown'}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          ['Tenants', health?.summary?.tenantCount],
          ['Active', health?.summary?.activeTenants],
          ['Pending', health?.summary?.pendingTenants],
          ['Suspended', health?.summary?.suspendedTenants],
          ['Branches', health?.summary?.totalBranches],
          ['Users', health?.summary?.totalUsers],
          ['Students', health?.summary?.totalStudents],
          ['Active Plans', health?.summary?.activePlans],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-800">{value ?? 0}</p>
          </div>
        ))}
      </div>

      {(health?.warnings || []).length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <AlertCircle size={16} /> Platform Warnings
          </h3>
          <div className="mt-3 space-y-2">
            {health.warnings.map((warning) => (
              <p key={warning} className="text-sm font-medium text-amber-700">{warning}</p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {services.map((service) => (
          <div key={service.name} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl bg-slate-50 ${service.color}`}>
                <service.icon size={24} />
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${getStatusPill(service.status)}`}>
                {service.status}
              </span>
            </div>
            <h3 className="font-bold text-slate-800">{service.name}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Performance Card */}
         <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
            <h3 className="font-bold text-slate-800 mb-8 flex items-center gap-2">
              <RefreshCw size={18} className="text-blue-500" />
              Response Time (Last 24h)
            </h3>
            <div className="h-64 flex items-end justify-between gap-1">
              {responseSeries.map((point, i) => (
                <div 
                  key={i} 
                  className={`flex-1 rounded-t-sm transition-all hover:opacity-100 opacity-60 ${(point.valueMs || 0) > 1000 ? 'bg-rose-400' : (point.valueMs || 0) > 500 ? 'bg-amber-400' : 'bg-blue-400'}`}
                  style={{ height: `${Math.max(3, ((point.valueMs || 0) / maxSeriesValue) * 100)}%` }}
                  title={`${point.valueMs || 0}ms at ${point.label}`}
                ></div>
              ))}
            </div>
            {responseSeries.length > 0 ? (
              <div className="flex justify-between mt-4 text-xs text-slate-400">
                <span>{responseSeries[0]?.label}</span>
                <span>{responseSeries[Math.floor(responseSeries.length / 2)]?.label}</span>
                <span>{responseSeries[responseSeries.length - 1]?.label}</span>
              </div>
            ) : (
              <p className="text-sm text-slate-500 mt-4">No response time metrics yet. Start using the API to populate this chart.</p>
            )}
         </div>

         {/* Stats Card */}
         <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-8">
            <div>
              <h4 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Platform Metrics</h4>
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock size={16} />
                    <span className="text-sm font-medium">Uptime</span>
                  </div>
                  <span className="font-bold text-slate-800">{health?.uptime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-slate-600">
                    <AlertCircle size={16} />
                    <span className="text-sm font-medium">Error Rate</span>
                  </div>
                  <span className="font-bold text-emerald-600">{health?.errorRate}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-slate-600">
                    <RefreshCw size={16} />
                    <span className="text-sm font-medium">Avg Response</span>
                  </div>
                  <span className="font-bold text-slate-800">{health?.avgResponseTime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Activity size={16} />
                    <span className="text-sm font-medium">P95 Response</span>
                  </div>
                  <span className="font-bold text-slate-800">{health?.metrics?.p95ResponseMs || 0}ms</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} className="text-emerald-500" />
                <span className="font-bold text-slate-800 text-sm">Runtime Summary</span>
              </div>
              <p className="text-xs text-slate-500">Queue status: {health?.queueStatus}. Requests(24h): {health?.metrics?.requests24h || 0}. Errors(24h): {health?.metrics?.errors24h || 0}.</p>
              <p className="mt-2 text-xs text-slate-500">CPU load: {health?.metrics?.cpuLoadPercent || 0}% • Memory usage: {health?.metrics?.memoryUsagePercent || 0}%</p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Monitoring;
