package main

import (
	"encoding/json"
	"errors"
	"io"
	"strings"
)

func decodePrivateSAM(input io.Reader) (string, error) {
	data, e := io.ReadAll(io.LimitReader(input, 8193))
	if e != nil || len(data) > 8192 {
		return "", errors.New("Invalid private credential input")
	}
	var request struct {
		Key string `json:"key"`
	}
	if e = json.Unmarshal(data, &request); e != nil {
		return "", errors.New("Invalid private credential input")
	}
	key := strings.TrimSpace(request.Key)
	if len(key) < 16 || len(key) > 512 {
		return "", errors.New("Enter the complete SAM.gov access key")
	}
	for _, c := range key {
		if c < 33 || c > 126 {
			return "", errors.New("The access key contains unsupported characters")
		}
	}
	return key, nil
}
