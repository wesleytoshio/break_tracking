# Makefile — Controle de Pausas (Electron)
# Requer Node/npm e make (roda no Git Bash/MSYS). Uso: make <alvo>  (só "make" = help)

.DEFAULT_GOAL := help
.PHONY: help install run dev old icons build dist rebuild clean

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

install: ## Instala as dependências (npm install)
	npm install

run: ## Roda o app (nova UI — nasce vazio, igual produção)
	npm start

dev: ## Roda em modo dev (34 operadores de amostra + botão "Teste de notificação")
	PAUSA_TEST_MODE=1 npm start

old: ## Roda a UI antiga (.dc.html) como fallback
	PAUSA_OLD_UI=1 npm start

icons: ## Regenera assets/icon.ico e icon.png a partir de assets/icon.svg
	node tools/gen-icons.js

operators: ## Gera Downloads/operadores_34.xlsx (34 operadores no formato de importação)
	node tools/gen-operators-xlsx.js

build: ## Gera o instalador Windows em dist/ (electron-builder --win)
	npm run dist

dist: build ## Alias de build

rebuild: clean build ## Limpa dist/ e builda do zero

clean: ## Remove a pasta dist/
	rm -rf dist
