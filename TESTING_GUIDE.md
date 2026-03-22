# Eagle Eye Testing Guide

This guide explains how to test Eagle Eye with mock data, local models, and real APIs.

## Quick Start

### 1. Enable Mock Mode

Set the environment variable to use mock data instead of real API calls:

```bash
export NEXT_PUBLIC_USE_MOCK_DATA=true
```

This will make all provider API calls return realistic mock data based on official API documentation.

### 2. Enable Local Model Analysis

To use a local model (Ollama/Mistral) instead of Claude:

```bash
export NEXT_PUBLIC_USE_LOCAL_MODEL=true
export LOCAL_MODEL_URL=http://localhost:11434/api/generate
export LOCAL_MODEL_NAME=mistral
```

### 3. Run the Application

```bash
npm run dev
```

The application will start on `http://localhost:3000` with mock data enabled.

## Testing Scenarios

### Scenario 1: Full End-to-End Test with Mock Data

1. **Enable mock mode**: `export NEXT_PUBLIC_USE_MOCK_DATA=true`
2. **Start the app**: `npm run dev`
3. **Navigate to**: `http://localhost:3000`
4. **Test the flow**:
   - Connect GitHub (will use mock GitHub data)
   - Add provider integrations (will use mock data)
   - Trigger a scan (will fetch mock provider data)
   - View analysis results (will use local model or mock analysis)

**Expected Results**:
- GitHub data shows mock repositories and insights
- Provider data shows realistic metrics (spending, usage, quotas)
- Analysis generates 5-12 recommendations with actionable insights
- No real API calls are made

### Scenario 2: Test with Real GitHub, Mock Providers

1. **Disable mock mode for GitHub**: `export NEXT_PUBLIC_USE_MOCK_DATA=false`
2. **Set GitHub token**: Add your real GitHub token to the database
3. **Enable mock for providers**: `export NEXT_PUBLIC_USE_MOCK_PROVIDER_DATA=true`
4. **Run the app**: `npm run dev`
5. **Test**:
   - Real GitHub data is fetched
   - Provider data uses mock values
   - Analysis works with real + mock data

### Scenario 3: Test Provider Discovery

1. **Enable mock mode**: `export NEXT_PUBLIC_USE_MOCK_DATA=true`
2. **Test the API**: 
   ```bash
   curl http://localhost:3000/api/providers/list
   ```
3. **Get provider metadata**:
   ```bash
   curl "http://localhost:3000/api/providers/metadata?provider=datadog"
   ```
4. **Get provider documentation**:
   ```bash
   curl "http://localhost:3000/api/providers/docs?provider=mongodb"
   ```

**Expected Results**:
- All known providers are listed with metadata
- Unknown providers are automatically registered
- Credential types are inferred for each provider
- Documentation URLs are provided

### Scenario 4: Test Analysis Pipeline

1. **Enable mock mode**: `export NEXT_PUBLIC_USE_MOCK_DATA=true`
2. **Enable local model**: `export NEXT_PUBLIC_USE_LOCAL_MODEL=true`
3. **Test the analysis endpoint**:
   ```bash
   curl -X POST http://localhost:3000/api/analyze \
     -H "Content-Type: application/json" \
     -d '{"integrations": {"providers": {"openai": {"monthlySpendUsd": 150}}}}'
   ```

**Expected Results**:
- Analysis is generated using local model
- Recommendations are returned as JSON
- No real Claude API calls are made

## Mock Data Structure

### Provider Mock Data

Each provider mock includes:
- `provider`: Provider ID
- `_summary`: Short status string (e.g., "Pro · $150/mo")
- `_signal`: Health assessment (e.g., "Usage is within limits")
- `_status`: Status indicator ("good", "warn", "upgrade", "info")
- Provider-specific fields (spending, usage, quotas, etc.)

Example:
```json
{
  "provider": "openai",
  "plan": "pro",
  "monthlySpendUsd": 150,
  "hardLimitUsd": 200,
  "_summary": "Pro · $150/mo",
  "_signal": "Usage is within limits",
  "_status": "good"
}
```

### Analysis Recommendations

Each recommendation includes:
- `id`: Unique identifier
- `provider`: Which provider the issue relates to
- `category`: Type of issue (spending, security, expiry, etc.)
- `severity`: Critical/warning/info/saving
- `title`: Short, punchy title (max 7 words)
- `description`: 2-3 sentences with specific data
- `action`: Actionable next step
- `saving`: Potential monthly savings (if applicable)
- `deadline`: ISO date if time-sensitive
- `icon`: Single emoji for visual identification

Example:
```json
{
  "id": "openai-spend-high",
  "provider": "openai",
  "category": "spending",
  "severity": "warning",
  "title": "High OpenAI spending detected",
  "description": "Your OpenAI spending is $150/month. Consider optimizing prompts or switching to cheaper models.",
  "action": "Review API usage patterns and optimize prompt efficiency.",
  "saving": "$20-50/mo",
  "deadline": null,
  "icon": "💰"
}
```

## Test Coverage

### Unit Tests

Run unit tests for analysis:
```bash
npm test lib/analyze.test.ts
```

Run integration tests for providers:
```bash
npm test lib/providers.integration.test.ts
```

### API Tests

Test provider fetching:
```bash
curl -X POST http://localhost:3000/api/integrations/fetch \
  -H "Content-Type: application/json" \
  -d '{"credentials": {"openai": {"apiKey": "sk-test"}}}'
```

Test scan trigger:
```bash
curl -X POST http://localhost:3000/api/scan/trigger \
  -H "Content-Type: application/json"
```

### Browser Tests

1. **Login flow**: Test GitHub OAuth with mock data
2. **Provider connection**: Add providers and verify data appears
3. **Scan trigger**: Trigger a scan and verify results
4. **Analysis display**: View recommendations and verify formatting
5. **Mobile responsive**: Test on mobile devices

## Debugging

### Enable Debug Logging

Set debug environment variable:
```bash
export DEBUG=eagle-eye:*
```

### Check Mock Data

View mock data for a provider:
```bash
node -e "const m = require('./lib/mock-providers'); console.log(JSON.stringify(m.getMockProvider('openai'), null, 2))"
```

### Monitor Network Requests

1. Open browser DevTools (F12)
2. Go to Network tab
3. Trigger a scan
4. Check that no real API calls are made (all requests should be to localhost)

### Check Local Model

Verify Ollama is running:
```bash
curl http://localhost:11434/api/tags
```

Pull a model:
```bash
ollama pull mistral
```

## Transitioning to Production

When ready to use real APIs:

1. **Disable mock mode**: `export NEXT_PUBLIC_USE_MOCK_DATA=false`
2. **Disable local model**: `export NEXT_PUBLIC_USE_LOCAL_MODEL=false`
3. **Set real API keys**: Add credentials to Supabase
4. **Set Anthropic API key**: `export ANTHROPIC_API_KEY=sk-...`
5. **Run the app**: `npm run dev`

The application will automatically:
- Use real API calls instead of mock data
- Use Claude for analysis instead of local model
- Fetch real GitHub data
- Generate real recommendations

## Troubleshooting

### Mock data not being used

Check that `NEXT_PUBLIC_USE_MOCK_DATA=true` is set:
```bash
echo $NEXT_PUBLIC_USE_MOCK_DATA
```

Restart the dev server after changing environment variables.

### Local model not responding

Ensure Ollama is running:
```bash
ollama serve
```

In another terminal, pull the model:
```bash
ollama pull mistral
```

### Analysis not generating recommendations

Check that integrations data is being passed correctly. Verify the structure matches the expected format.

### Provider data not appearing

1. Check that credentials are stored in Supabase
2. Verify mock mode is enabled if using mock data
3. Check browser console for errors
4. Check server logs for API errors

## Performance Testing

### Load Testing

Test with multiple concurrent scans:
```bash
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/scan/trigger &
done
wait
```

### Memory Usage

Monitor memory during scans:
```bash
watch -n 1 'ps aux | grep node'
```

### Response Time

Measure scan trigger response time:
```bash
time curl -X POST http://localhost:3000/api/scan/trigger
```

## Continuous Integration

For CI/CD pipelines, use:

```bash
# Run with mock data
export NEXT_PUBLIC_USE_MOCK_DATA=true
npm run build
npm run test
```

This ensures tests run without external dependencies.
