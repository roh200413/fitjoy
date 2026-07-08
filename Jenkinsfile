// FITJOY CI/CD 파이프라인
//
// 사전 준비 (Jenkins 설정):
// 1. Jenkins에 Docker, docker-compose 플러그인/바이너리가 설치되어 있어야 합니다.
// 2. Docker Hub(또는 사설 레지스트리) 로그인 정보를 Credentials에 등록하고
//    아래 DOCKERHUB_CREDENTIALS_ID 값을 해당 Credential ID로 맞춰주세요.
// 3. DOCKER_REGISTRY / IMAGE_NAMESPACE 값을 본인 Docker Hub 계정 또는 레지스트리 주소로 변경하세요.
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        DOCKER_REGISTRY          = 'docker.io'
        IMAGE_NAMESPACE          = 'your-dockerhub-id'
        BACKEND_IMAGE            = "${DOCKER_REGISTRY}/${IMAGE_NAMESPACE}/fitjoy-backend"
        FRONTEND_IMAGE           = "${DOCKER_REGISTRY}/${IMAGE_NAMESPACE}/fitjoy-frontend"
        IMAGE_TAG                = "${env.BUILD_NUMBER}-${GIT_COMMIT.take(7)}"
        DOCKERHUB_CREDENTIALS_ID = 'dockerhub-credentials'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Backend Build & Check') {
            steps {
                dir('backend') {
                    sh '''
                        python3 -m venv .venv
                        . .venv/bin/activate
                        pip install --no-cache-dir -r requirements.txt
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
                sh """
                    docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} -t ${BACKEND_IMAGE}:latest ./backend
                    docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} -t ${FRONTEND_IMAGE}:latest ./frontend
                """
            }
        }

        stage('Docker Push') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: DOCKERHUB_CREDENTIALS_ID,
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login "$DOCKER_REGISTRY" -u "$DOCKER_USER" --password-stdin
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${BACKEND_IMAGE}:latest
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:latest
                        docker logout "$DOCKER_REGISTRY"
                    '''
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh '''
                    BACKEND_IMAGE=${BACKEND_IMAGE} FRONTEND_IMAGE=${FRONTEND_IMAGE} IMAGE_TAG=${IMAGE_TAG} \
                        docker compose up -d --remove-orphans
                '''
            }
        }
    }

    post {
        always {
            sh 'docker image prune -f || true'
        }
        success {
            echo "빌드 성공: ${BACKEND_IMAGE}:${IMAGE_TAG}, ${FRONTEND_IMAGE}:${IMAGE_TAG}"
        }
        failure {
            echo '빌드 실패 - 로그를 확인하세요.'
        }
    }
}
