pipeline {
    agent any

    options {
        disableConcurrentBuilds(abortPrevious: true)
        skipDefaultCheckout(true)
        timeout(time: 10, unit: 'MINUTES')
        timestamps()
    }

    // The GitHub plugin handles POST requests sent to /github-webhook/.
    triggers {
        githubPush()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Report build started') {
            steps {
                // Uses the credentials from the GitHub server configured in Jenkins.
                step([
                    $class: 'GitHubSetCommitStatusBuilder',
                    contextSource: [
                        $class: 'ManuallyEnteredCommitContextSource',
                        context: 'continuous-integration/jenkins'
                    ],
                    statusMessage: [content: 'Jenkins build is running']
                ])
            }
        }

        stage('Check agent') {
            steps {
                sh '''
                    set -eu
                    command -v node
                    command -v npm
                    command -v scp
                    node --version
                    npm --version
                '''
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Deploy') {
            steps {
                sh 'scp -r ./dist/* root@202.92.21.30:/root/Projects/FileServe/public/homeworks/cse513-1'
            }
        }
    }

    post {
        always {
            // Replace the pending status with the final Jenkins build result.
            step([
                $class: 'GitHubCommitStatusSetter',
                contextSource: [
                    $class: 'ManuallyEnteredCommitContextSource',
                    context: 'continuous-integration/jenkins'
                ],
                errorHandlers: [[$class: 'ShallowAnyErrorHandler']],
                statusResultSource: [$class: 'DefaultStatusResultSource']
            ])
        }
        success {
            echo 'Build, tests, and deployment completed successfully.'
        }
        failure {
            echo 'Deployment stopped. Read the failed stage in the console log.'
        }
    }
}
