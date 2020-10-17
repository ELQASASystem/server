import Axios from 'axios'
import {Chart} from '@antv/g2'

export default {
    name: "Detail",
    data() {
        return {
            Question: { // 题目信息
                loading: true, // 加载状态
                id: this.$route.params.id, // ID
                object: {}, // 对象
                type: '', // 类型
                text: '', // 题干
                optionsDisplay: true, // 是否显示选项
                options: [], // 选项[仅选择题]
                key: '' // 答案
            },
            groupMemList: [], // 群成员
            Status: { // 状态信息
                Tab: {
                    0: {label: '等待发布答题', color: 'green', badge: 'success'},
                    1: {label: '正在答题中', color: 'blue', badge: 'processing'},
                    2: {label: '答题已结束', color: 'red', badge: 'error'}
                },

                status: 0, // 状态值
                answererCount: 0, // 答题人数
                sliderValue: 0, // 状态条值
                sliderLabel: {0: '准备作答', 1: '允许作答', 2: '停止作答'}, // 说明标签

            },
            Statistics: {
                rightRate: 0, // 正确率
                rightCount: 0, // 正确人数
                wrongRate: 0, // 错误率
                wrongCount: 0, // 错误人数
                rightStus: [], // 回答正确的学生
                wrongStus: {} // 回答错误的学生
            },

            CHARTData: {}
        }
    },
    methods: {
        fetchData() { // API 获取数据

            Axios.get('http://localhost:4040/apis/question/a/' + this.Question.id).then(res => {

                console.log('成功获取答题数据：')
                console.log(res.data)

                Axios.get('http://localhost:4040/apis/group/mem/' + res.data.target).then(res => {

                    console.log('成功获取群成员：')
                    console.log(res.data)

                    let list = {}

                    for (let i = 0; i < res.data.length; i++) {
                        list[res.data[i].id] = res.data[i]
                    }

                    console.log(list)
                    this.groupMemList = list

                }).catch(err => {
                    console.error('获取群成员失败：' + err)
                })

                this.Question.object = res.data

                try {
                    this.displayQuestion()
                    console.log('数据初始化成功')
                } catch (e) {
                    console.error('执行数据初始化失败：' + e)
                }


                this.Question.loading = false

            }).catch(err => {
                console.error('获取答题数据失败：' + err)
            })

        },
        displayQuestion() { // 显示问题数据

            const type = {0: '选择题', 1: '简答题'}

            this.Question.type = type[this.Question.object.type] // 题目类型

            { // 题目
                this.Question.text = this.Question.object.question
                this.Question.key = this.Question.object.key

                if (this.Question.object.type === 1) {
                    this.Question.optionsDisplay = false
                } else {
                    this.Question.options = JSON.parse(this.Question.object.options)
                }
            }

            { // 状态
                this.Status.status = this.Question.object.status
                this.Status.answererCount = this.Question.object.answer.length
                this.Status.sliderValue = this.Question.object.status
            }

            this.calc()


            { // 图表

                this.histogram('data-chart-right_count',
                    this.Statistics.rightCount, '正确人数 ' + this.Statistics.rightCount)
                this.histogram('data-chart-wrong_count',
                    this.Statistics.wrongCount, '错误人数 ' + this.Statistics.wrongCount)

            }

        },

        calc() {

            const answer = this.Question.object.answer
            const options = this.Question.options

            for (let i = 0; i < answer.length; i++) {

                if (answer[i].answer === this.Question.key) {
                    this.Statistics.rightCount++
                    this.Statistics.rightStus.push(answer[i].answerer_id)
                } else {
                    this.Statistics.wrongCount++

                    // 寻找错误的选项
                    for (let ii = 0; ii < options.length; ii++) {
                        if (options[ii].type !== answer[i].answer) {
                            continue
                        }

                        let list = this.Statistics.wrongStus[options[ii].type]
                        if (list === undefined) {
                            list = []
                        }

                        list.push(answer[i].answerer_id)
                        this.Statistics.wrongStus[options[ii].type] = list
                    }
                }

            }

            console.log(this.Statistics.rightStus)
            console.log(this.Statistics.wrongStus)

            this.Statistics.rightRate = parseInt(this.Statistics.rightCount / this.Status.answererCount * 100)
            this.Statistics.wrongRate = 100 - this.Statistics.rightRate

        },

        histogram(elm, data, text) {

            const chart = new Chart({
                container: elm,
                autoFit: true,
                width: 240
            })

            chart.data([{type: text, value: data}])
            chart.scale('sales', {nice: true})
            chart.interval().position('type*value')

            chart.render()

        },

        changeStatus() {

            console.log(this.Status.status)

            this.$notification.info({
                message: '正在中...'
            })

            this.Status.status = this.Status.sliderValue

        },
        cancelChangeStatus() {
            this.Status.sliderValue = this.Status.status
        },

        praise() {
            Axios.get(`http://localhost:4040/apis/group/praise?target=${this.Question.object.target}&mem=${JSON.stringify(this.Statistics.rightStus)}`).then(() => {
                this.$notification.success({message: '表扬成功'})
            }).catch(err => {
                console.error('激励失败：' + err)
            })
        }

    },
    mounted() {
        this.fetchData()
    }
}