# Google Mobility Assistant

## Supported Flow

The assistant can help with a Calendar event that has a location:

1. The frontend requests browser geolocation only for route-like prompts.
2. The backend forwards `userLocation` to AgentCore Runtime for that request.
3. MainAgent reads Calendar events through AgentCore Identity 3LO.
4. MainAgent resolves the free-form Calendar `location` through Google Maps Gateway tools.
5. MainAgent computes a route preview from the current location to the event location.
6. MainAgent emits a structured `route_preview` event.
7. The frontend renders a route card and can ask the agent to set a Calendar reminder.

## Smoke Prompts

```text
오늘 위치가 있는 일정 중 다음 일정까지 어떻게 가?
```

```text
Find my next calendar event with a location and show a driving route from my current location.
```

```text
Set a popup reminder 40 minutes before that event.
```

## Deployment Notes

Google Calendar remains a direct AgentCore Identity 3LO tool because it acts on user-owned Calendar data. Google Maps is a Gateway Lambda target because it uses a service API key and does not need per-user OAuth.

Deploy order:

1. Deploy the Google Maps tool Lambda with Terraform.
2. Register or update the `google-maps` Gateway target.
3. Deploy MainAgent so the runtime prompt and `show_route_preview` tool are available.
4. Deploy backend and frontend so `userLocation` and `route_preview` events pass through.
5. Run the AgentCore inventory audit.

```bash
terraform -chdir=infra/envs/dev apply -var-file=terraform.tfvars
python3 scripts/register_google_maps_gateway_target.py \
  --profile developer-dongik \
  --region ap-northeast-2 \
  --lambda-arn "$(terraform -chdir=infra/envs/dev output -raw google_maps_lambda_arn)"
python3 scripts/audit_agentcore_resources.py --profile developer-dongik
```

## Privacy

The frontend sends current location only when the prompt looks route-related. The backend does not persist `userLocation` separately. MainAgent disables AgentCore Memory for turns that include `userLocation`, so precise current location is not written to long-term memory by the memory session manager.

Assistant message history may still contain destination labels, route summaries, and Google Maps URLs because those are part of the conversation.

## Release Checklist

- [ ] Route prompt without browser location permission returns a useful fallback.
- [ ] Route prompt with permission renders a route card.
- [ ] Calendar event without location asks the user which destination to use.
- [ ] Calendar event with ambiguous location uses Maps place search before routing.
- [ ] Reminder action sets one popup reminder and preserves event title, time, attendees, location, and other reminder methods.
- [ ] Raw Google Maps API key never appears in logs, frontend bundle, README, or Git history.
