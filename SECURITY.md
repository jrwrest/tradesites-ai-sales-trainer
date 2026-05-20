# Security Policy

## Supported Versions

This project is in early alpha. Security fixes target the current `main` branch and active release branches.

## Reporting A Vulnerability

Do not open a public issue with secrets, live infrastructure details, customer data, or exploit steps.

Use GitHub private vulnerability reporting if it is enabled for the repository. If it is not available, contact the maintainer privately through the account linked from the repository.

Helpful reports include:

- affected route, command, or file;
- impact and likely attack path;
- minimal reproduction steps using synthetic data;
- whether any token, transcript, or private deployment detail was exposed.

## Public Demo Safety

Public/shared deployments should:

- require authentication;
- disable open signup unless intentionally supported;
- keep PocketBase and model gateways off the public internet;
- keep provider tokens and `.env` files outside git;
- avoid uploading real customer transcripts to fixtures;
- set rate limits and quotas around model-backed providers.
