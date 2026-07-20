pipeline {
  agent any

  environment {
    COMPOSE_PROJECT_NAME = 'fitjoy'
    VITE_API_BASE = "${env.VITE_API_BASE ?: '/api'}"
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Backend Check') {
      steps {
        dir('backend') {
          sh '''
            python3 -m venv .venv
            . .venv/bin/activate
            pip install --upgrade pip
            pip install -r requirements.txt
            python -m py_compile app/*.py run.py
          '''
        }
      }
    }

    stage('Frontend Build') {
      steps {
        dir('frontend') {
          sh '''
            npm ci
            npm run build
          '''
        }
      }
    }

    stage('Docker Build') {
      steps {
        sh 'docker compose build --pull'
      }
    }

    stage('Deploy') {
      when {
        expression {
          return !env.CHANGE_ID && (!env.BRANCH_NAME || env.BRANCH_NAME == 'main')
        }
      }
      steps {
        sh '''
          docker compose down --remove-orphans || true
          docker compose up -d --build --remove-orphans
        '''
      }
    }

    stage('Smoke Test') {
      when {
        expression {
          return !env.CHANGE_ID && (!env.BRANCH_NAME || env.BRANCH_NAME == 'main')
        }
      }
      steps {
        sh '''
          docker compose ps

          for i in $(seq 1 30); do
            curl -fsS http://127.0.0.1:8011/ && break
            echo "Waiting for backend... $i/30"
            sleep 2
          done

          for i in $(seq 1 30); do
            curl -fsS http://127.0.0.1:3100/ >/dev/null && break
            echo "Waiting for frontend... $i/30"
            sleep 2
          done
        '''
      }
    }
  }

  post {
    always {
      sh 'docker compose ps || true'
      sh 'docker compose logs --tail=120 || true'
    }
  }
}
