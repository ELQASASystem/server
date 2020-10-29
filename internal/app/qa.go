package class

import (
	"strconv"
	"strings"
	"time"

	"github.com/ELQASASystem/app/internal/app/database"
	"github.com/ELQASASystem/app/internal/app/qq"

	jsoniter "github.com/json-iterator/go"
	"github.com/rs/zerolog/log"
)

// Question 问题
type Question struct {
	*database.QuestionListTab
	Answer []*database.AnswerListTab `json:"answer"`
}

var QABasicSrvPoll = map[uint64]*Question{} // QABasicSrvPoll 问答基本服务线程池

// StartQA 使用 i：问题ID(ID) 开始作答
func StartQA(i uint32) (err error) {

	q, err := ReadQuestion(i)
	if err != nil {
		log.Error().Err(err).Msg("读取问题失败")
		return
	}

	var (
		options []struct {
			Type string `json:"type"` // 选项号
			Body string `json:"body"` // 选项内容
		}
		m = Bot.NewMsg().AddText("问题:\n").AddText(q.Question).AddText("\n选项:\n")
	)

	if err = jsoniter.ConfigCompatibleWithStandardLibrary.UnmarshalFromString(q.Options, &options); err != nil {
		log.Error().Err(err).Msg("解析选项失败")
		return
	}
	for _, v := range options {
		m.AddText(v.Type + ". " + v.Body + "\n")
	}

	if q.Type == 0 {
		m.AddText("\n回复选项即可作答")
	} else {
		m.AddText("\n@+回答内容即可作答")
	}

	log.Info().Msg("问题 " + strconv.Itoa(int(i)) + " 开始监听")

	Bot.SendGroupMsg(m.To(q.Target))
	QABasicSrvPoll[q.Target] = q

	return
}

// StopQA 使用 i：问题ID(ID) 停止问答
func StopQA(i uint32) (err error) {

	err = deleteQABasicSrvPoll(i)
	if err != nil {
		log.Error().Err(err).Msg("删除问答基本服务监听失败")
		return
	}
	err = db.Question().UpdateQuestion(i, 2)
	if err != nil {
		log.Error().Err(err).Msg("更新问答状态字段失败")
		return
	}

	log.Info().Msg("问题 " + strconv.Itoa(int(i)) + " 已停止答题")

	return
}

// PrepareQA 使用 i：问题ID(ID) 准备作答
func PrepareQA(i uint32) (err error) {

	err = deleteQABasicSrvPoll(i)
	if err != nil {
		log.Error().Err(err).Msg("删除问答基本服务监听失败")
		return
	}
	err = db.Question().UpdateQuestion(i, 0)
	if err != nil {
		log.Error().Err(err).Msg("更新问答状态字段失败")
		return
	}

	return
}

// ReadQuestion 使用 i：问题ID(ID) 读取问答信息
func ReadQuestion(i uint32) (q *Question, err error) {

	res, err := db.Question().ReadQuestion(i)
	if err != nil {
		return
	}

	res2, err := db.Answer().ReadAnswerList(i)
	if err != nil {
		return
	}

	return &Question{res, res2}, nil
}

// writeAnswer 写入回答答案
func writeAnswer(q *Question, stu uint64, ans string) {

	answer := &database.AnswerListTab{
		QuestionID: q.ID,
		AnswererID: stu,
		Answer:     ans,
		Time:       time.Now().Format("2006-01-02 15:04:05"),
	}

	err := db.Answer().WriteAnswerList(answer)
	if err != nil {
		log.Warn().Err(err).Msg("写入答案失败")
		return
	}

	q.Answer = append(q.Answer, answer)

	log.Info().Msg("成功写入回答")
	qch <- q
}

// handleAnswer 处理消息中可能存在的答案
func handleAnswer(m *qq.Msg) {

	q, ok := QABasicSrvPoll[m.Group.ID]
	if !ok {
		return
	}

	for _, v := range q.Answer {
		if v.AnswererID == m.User.ID {
			return
		}
	}

	switch q.Type {
	// 选择题
	case 0:
		if checkAnswerForSelect(m.Chain[0].Text) {
			writeAnswer(q, m.User.ID, strings.ToUpper(m.Chain[0].Text))
		}
	// 填空题
	case 1:
		if checkAnswerForFill(m.Chain[0].Text) {
			writeAnswer(q, m.User.ID, strings.TrimPrefix(m.Chain[0].Text, "#"))
		}
	}

}

// deleteQABasicSrvPoll 使用 i：问题ID(ID) 删除问答基本服务池字段
func deleteQABasicSrvPoll(i uint32) (err error) {

	q, err := db.Question().ReadQuestion(i)
	if err != nil {
		return
	}

	delete(QABasicSrvPoll, q.Target)
	return
}
