# Grafana Stack OpenTelemetry Integration Guide

This guide explains how to configure your existing Grafana stack to receive OpenTelemetry data from the AI Assistant application.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Grafana Alloy Configuration](#grafana-alloy-configuration)
- [Application Configuration](#application-configuration)
- [Grafana Data Sources](#grafana-data-sources)
- [Querying Logs and Traces](#querying-logs-and-traces)
- [Troubleshooting](#troubleshooting)
- [Alternative Platforms](#alternative-platforms)

---

## Overview

### Stack Components

Your Grafana observability stack should include:

1. **Grafana Alloy** - OpenTelemetry collector that receives and routes telemetry
2. **Loki** - Log aggregation and storage
3. **Tempo** - Distributed tracing backend
4. **Prometheus** - Metrics collection and storage (optional)
5. **Grafana** - Unified visualization and querying

### Data Flow

```
AI Assistant Application
    ↓ (OTLP over gRPC/HTTP)
Grafana Alloy (Collector)
    ↓
    ├→ Loki (Logs)
    ├→ Tempo (Traces)
    └→ Prometheus (Metrics)
    ↓
Grafana (Visualization)
```

---

## Prerequisites

### Required Services

Ensure your Grafana stack has these services running:

- **Grafana Alloy** (or OpenTelemetry Collector) listening on ports:
  - `4317` for gRPC (default)
  - `4318` for HTTP
- **Loki** (typically on port `3100`)
- **Tempo** (typically on port `3200`)
- **Grafana** (typically on port `3000`)

### Network Accessibility

Ensure the AI Assistant backend can reach Grafana Alloy:

```bash
# Test gRPC endpoint
telnet <alloy-host> 4317

# Test HTTP endpoint
curl http://<alloy-host>:4318/v1/traces
```

---

## Grafana Alloy Configuration

### Basic Configuration

Create or update your Alloy configuration file (typically `config.alloy`):

```hcl
// ===== OTLP Receiver =====
// Receives OpenTelemetry data from applications
otelcol.receiver.otlp "default" {
  // gRPC endpoint (recommended for performance)
  grpc {
    endpoint = "0.0.0.0:4317"
  }
  
  // HTTP endpoint (alternative)
  http {
    endpoint = "0.0.0.0:4318"
  }
  
  output {
    metrics = [otelcol.processor.batch.default.input]
    logs    = [otelcol.processor.batch.default.input]
    traces  = [otelcol.processor.batch.default.input]
  }
}

// ===== Batch Processor =====
// Batches telemetry data for efficient export
otelcol.processor.batch "default" {
  timeout             = "5s"
  send_batch_size     = 512
  send_batch_max_size = 1024
  
  output {
    metrics = [otelcol.exporter.prometheus.default.input]
    logs    = [otelcol.exporter.loki.default.input]
    traces  = [otelcol.exporter.otlp.tempo.input]
  }
}

// ===== Log Export to Loki =====
otelcol.exporter.loki "default" {
  forward_to = [loki.write.local.receiver]
}

loki.write "local" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
    
    // Optional: Add authentication for Grafana Cloud
    // headers = {
    //   "Authorization" = "Bearer YOUR_TOKEN",
    // }
  }
  
  // Add labels from resource attributes
  external_labels = {
    cluster = "production",
  }
}

// ===== Trace Export to Tempo =====
otelcol.exporter.otlp "tempo" {
  client {
    endpoint = "tempo:4317"
    
    tls {
      insecure = true  // Set to false with TLS
    }
    
    // Optional: Add authentication
    // headers = {
    //   "Authorization" = "Bearer YOUR_TOKEN",
    // }
  }
}

// ===== Metrics Export to Prometheus =====
otelcol.exporter.prometheus "default" {
  forward_to = [prometheus.remote_write.local.receiver]
}

prometheus.remote_write "local" {
  endpoint {
    url = "http://prometheus:9090/api/v1/write"
  }
}
```

### Advanced Configuration

#### Add Resource Attribute Processing

Enrich telemetry with additional metadata:

```hcl
otelcol.processor.resource "add_attributes" {
  attributes {
    action = "insert"
    key    = "environment"
    value  = "production"
  }
  
  attributes {
    action = "insert"
    key    = "region"
    value  = "us-east-1"
  }
  
  output {
    metrics = [otelcol.processor.batch.default.input]
    logs    = [otelcol.processor.batch.default.input]
    traces  = [otelcol.processor.batch.default.input]
  }
}

// Update receiver to use resource processor
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }
  
  output {
    metrics = [otelcol.processor.resource.add_attributes.input]
    logs    = [otelcol.processor.resource.add_attributes.input]
    traces  = [otelcol.processor.resource.add_attributes.input]
  }
}
```

#### Filter Out Noisy Logs

Exclude health check logs:

```hcl
otelcol.processor.filter "drop_health_checks" {
  logs {
    // Drop logs from health check endpoints
    exclude {
      match_type = "regexp"
      record_attributes {
        key   = "http.target"
        value = ".*/health.*"
      }
    }
  }
  
  output {
    logs = [otelcol.processor.batch.default.input]
  }
}
```

### Reload Alloy Configuration

After updating the configuration:

```bash
# If running in Docker
docker restart alloy

# If running as systemd service
sudo systemctl restart alloy

# Check logs for errors
docker logs alloy
# or
journalctl -u alloy -f
```

---

## Application Configuration

### Update Application Config

Edit your application's `config.yaml`:

```yaml
logging:
  # Basic logging settings
  level: INFO
  format: json
  
  # Enable OpenTelemetry
  enable_otel: true
  
  # Alloy endpoint (adjust host/port for your setup)
  otel_endpoint: http://alloy:4317  # Use your Alloy host
  otel_protocol: grpc  # or "http" for port 4318
  
  # Service identification
  otel_service_name: ai-assistant
  otel_service_version: 1.0.0
  otel_deployment_environment: production
  
  # Export configuration
  otel_export_logs: true
  otel_export_traces: true
  
  # Performance tuning (adjust based on load)
  otel_batch_size: 512
  otel_schedule_delay_ms: 5000
  otel_export_timeout_ms: 30000
  
  # Custom labels (appear in Grafana)
  otel_resource_attributes:
    region: us-east-1
    team: platform
    instance_id: prod-001
```

### Configuration for Different Environments

#### Development (Local Testing)

```yaml
logging:
  enable_otel: true
  otel_endpoint: http://localhost:4317
  otel_deployment_environment: development
  otel_insecure: true
```

#### Staging

```yaml
logging:
  enable_otel: true
  otel_endpoint: http://alloy.staging.internal:4317
  otel_deployment_environment: staging
  otel_service_version: 1.0.0-rc1
```

#### Production

```yaml
logging:
  enable_otel: true
  otel_endpoint: http://alloy.prod.internal:4317
  otel_deployment_environment: production
  otel_insecure: false  # Use TLS
  otel_service_version: 1.0.0
```

### Install OpenTelemetry Packages

Install the required OTEL packages:

```bash
cd backend
pip install -e '.[otel]'
```

This installs:
- opentelemetry-api
- opentelemetry-sdk
- opentelemetry-exporter-otlp-proto-grpc
- opentelemetry-exporter-otlp-proto-http
- opentelemetry-instrumentation-fastapi
- opentelemetry-instrumentation-logging

---

## Grafana Data Sources

### Add Loki Data Source

1. Navigate to **Configuration > Data Sources**
2. Click **Add data source**
3. Select **Loki**
4. Configure:
   - **Name**: Loki
   - **URL**: `http://loki:3100` (adjust for your setup)
   - **Derived fields** (optional, for trace correlation):
     - Name: `trace_id`
     - Regex: `"trace_id":"(\w+)"`
     - Internal link: Tempo data source
     - Query: `${__value.raw}`
5. Click **Save & Test**

### Add Tempo Data Source

1. Navigate to **Configuration > Data Sources**
2. Click **Add data source**
3. Select **Tempo**
4. Configure:
   - **Name**: Tempo
   - **URL**: `http://tempo:3200` (adjust for your setup)
   - **Trace to logs** (optional, for log correlation):
     - Data source: Loki
     - Tags: `service_name`, `deployment_environment`
5. Click **Save & Test**

### Add Prometheus Data Source (Optional)

1. Navigate to **Configuration > Data Sources**
2. Click **Add data source**
3. Select **Prometheus**
4. Configure:
   - **Name**: Prometheus
   - **URL**: `http://prometheus:9090`
5. Click **Save & Test**

---

## Querying Logs and Traces

### LogQL Queries (Loki)

#### Basic Log Queries

```logql
# All logs from AI Assistant
{service_name="ai-assistant"}

# Logs from production environment
{service_name="ai-assistant", deployment_environment="production"}

# Error logs only
{service_name="ai-assistant"} | json | level="ERROR"

# Logs from specific module
{service_name="ai-assistant"} | json | logger=~"ai_assistant.llm.*"
```

#### Advanced Log Queries

```logql
# HTTP requests with duration > 1 second
{service_name="ai-assistant"} 
| json 
| duration_ms > 1000

# Logs with specific status codes
{service_name="ai-assistant"} 
| json 
| status_code >= 500

# Count errors per minute
sum by (level) (
  count_over_time({service_name="ai-assistant"} | json | level="ERROR" [1m])
)

# Top 10 slowest requests
topk(10,
  max_over_time({service_name="ai-assistant"} 
    | json 
    | unwrap duration_ms [5m]
  ) by (http_target)
)
```

#### Log Pattern Extraction

```logql
# Extract and count HTTP methods
{service_name="ai-assistant"} 
| json 
| line_format "{{.method}} {{.path}}"
| pattern "<method> <path>"

# Group by endpoint
sum by (path) (
  count_over_time({service_name="ai-assistant"} | json [5m])
)
```

### TraceQL Queries (Tempo)

#### Basic Trace Queries

```traceql
# All traces from service
{service.name="ai-assistant"}

# Traces from production
{service.name="ai-assistant" && deployment.environment="production"}

# Slow traces (> 1 second)
{service.name="ai-assistant"} && duration > 1s

# Traces with errors
{service.name="ai-assistant" && status=error}
```

#### Advanced Trace Queries

```traceql
# Traces with specific span attributes
{service.name="ai-assistant" && span.http.method="POST"}

# Traces with database calls
{service.name="ai-assistant" && span.db.system="postgresql"}

# Traces by specific user
{service.name="ai-assistant" && resource.user.id="12345"}

# P95 duration by endpoint
{service.name="ai-assistant"} 
| by(span.http.target) 
| select(quantile(0.95))
```

### Creating Grafana Dashboards

#### Example Dashboard Panels

**1. Request Rate Panel**
- Query: `sum(rate({service_name="ai-assistant"} | json [1m]))`
- Visualization: Time series graph

**2. Error Rate Panel**
- Query: `sum(rate({service_name="ai-assistant"} | json | level="ERROR" [1m]))`
- Visualization: Time series graph with alert threshold

**3. Response Time Panel**
- Query: `histogram_quantile(0.95, {service_name="ai-assistant"} | json | unwrap duration_ms)`
- Visualization: Time series graph showing P95, P99

**4. Recent Errors Table**
- Query: `{service_name="ai-assistant"} | json | level="ERROR"`
- Visualization: Logs panel with latest 100 entries

**5. Trace Service Map**
- Data source: Tempo
- Visualization: Service graph
- Query: `{service.name="ai-assistant"}`

---

## Troubleshooting

### No Data Appearing in Grafana

**Check application logs:**
```bash
# Look for OTEL configuration messages
tail -f ~/.config/ai-assistant/logs/app.log | grep -i otel
```

Expected messages:
- "Configuring OTEL traces: endpoint=..."
- "Configuring OTEL logs: endpoint=..."
- "OTEL trace export configured successfully"
- "OTEL log export configured successfully"

**Check Alloy is receiving data:**
```bash
# View Alloy logs
docker logs alloy -f

# Look for incoming connections
# Should see messages about received spans/logs
```

**Verify network connectivity:**
```bash
# From application host, test Alloy endpoint
telnet <alloy-host> 4317

# Test HTTP endpoint
curl -v http://<alloy-host>:4318/v1/traces
```

### OTEL Packages Not Installed

**Error message:**
```
OpenTelemetry packages not installed. Install with: pip install -e '.[otel]'
```

**Solution:**
```bash
cd backend
pip install -e '.[otel]'
```

### Connection Refused Errors

**Error in logs:**
```
Failed to export traces: connection refused
```

**Check:**
1. Alloy is running: `docker ps | grep alloy`
2. Correct endpoint in config: `otel_endpoint: http://alloy:4317`
3. Firewall allows port 4317/4318
4. Alloy is listening: `netstat -an | grep 4317`

### SSL/TLS Errors

**Error:**
```
SSL certificate verification failed
```

**Solution for development:**
```yaml
otel_insecure: true
```

**Solution for production:**
```yaml
otel_insecure: false
# Ensure valid SSL certificate on Alloy
```

### High Memory Usage

If application memory usage is high:

**Reduce batch settings:**
```yaml
otel_batch_size: 256  # Reduce from 512
otel_max_queue_size: 1024  # Reduce from 2048
```

**Increase export frequency:**
```yaml
otel_schedule_delay_ms: 2000  # Reduce from 5000
```

### Traces Not Correlated with Logs

Ensure FastAPI instrumentation is working:

**Check startup logs:**
```
FastAPI auto-instrumentation enabled
```

**Verify trace context in logs:**
```bash
# Logs should include trace_id and span_id
tail -f ~/.config/ai-assistant/logs/app.log | jq '.trace_id'
```

### Alloy Configuration Errors

**Test Alloy configuration:**
```bash
# Validate config syntax
docker exec alloy alloy validate /etc/alloy/config.alloy

# Restart with verbose logging
docker run --rm -v ./alloy-config.alloy:/etc/alloy/config.alloy \
  grafana/alloy:latest \
  run /etc/alloy/config.alloy --log.level=debug
```

---

## Alternative Platforms

The application's OpenTelemetry integration works with any OTLP-compatible platform:

### Jaeger

```yaml
otel_endpoint: http://jaeger:4317
otel_protocol: grpc
```

### Datadog

```yaml
otel_endpoint: https://http-intake.logs.datadoghq.com
otel_protocol: http
otel_headers:
  DD-API-KEY: "your-api-key"
```

### New Relic

```yaml
otel_endpoint: https://otlp.nr-data.net:4317
otel_protocol: grpc
otel_headers:
  api-key: "your-license-key"
```

### Honeycomb

```yaml
otel_endpoint: https://api.honeycomb.io:443
otel_protocol: grpc
otel_headers:
  x-honeycomb-team: "your-api-key"
```

### AWS X-Ray (via ADOT Collector)

```yaml
otel_endpoint: http://localhost:4317
otel_protocol: grpc
otel_resource_attributes:
  aws.region: us-east-1
```

---

## Best Practices

### 1. Use Descriptive Service Names

```yaml
otel_service_name: ai-assistant-api  # Good
otel_service_name: app  # Too generic
```

### 2. Always Set Version

```yaml
otel_service_version: 1.2.3  # Helps track issues to releases
```

### 3. Use Custom Resource Attributes

```yaml
otel_resource_attributes:
  environment: production
  datacenter: us-east-1a
  team: ml-platform
  cost_center: eng-001
```

### 4. Tune for Your Load

High traffic:
```yaml
otel_batch_size: 1024
otel_schedule_delay_ms: 2000
```

Low traffic:
```yaml
otel_batch_size: 128
otel_schedule_delay_ms: 10000
```

### 5. Monitor OTEL Overhead

Add Prometheus metrics for OTEL:
- Export queue size
- Export failure rate
- Export latency

---

## Additional Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Grafana Alloy Documentation](https://grafana.com/docs/alloy/latest/)
- [Loki LogQL Documentation](https://grafana.com/docs/loki/latest/logql/)
- [Tempo TraceQL Documentation](https://grafana.com/docs/tempo/latest/traceql/)
- [Application Logging Best Practices](./logging-best-practices.md)
- [Configuration System Documentation](../backend/src/config/README.md)

---

**Last Updated**: January 22, 2026  
**Version**: 1.0
