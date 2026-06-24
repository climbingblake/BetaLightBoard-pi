.PHONY: dev build deploy install

# --- Local dev ---
dev-backend:
	LED_SIMULATE=1 uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

# --- Build ---
build:
	cd frontend && npm run build

# --- Pi deployment ---
install-service:
	sudo cp betalightboard.service /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable betalightboard
	sudo systemctl restart betalightboard

logs:
	sudo journalctl -u betalightboard -f

# --- DB ---
migrate:
	alembic upgrade head

migrate-new:
	alembic revision --autogenerate -m "$(msg)"
